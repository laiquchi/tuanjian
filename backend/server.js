const express = require('express')
const cors = require('cors')

const { readStore, writeStore, createId } = require('./src/store')
const { QUARTERLY_ALLOWANCE, buildDashboard, buildRecordList, isValidQuarter } = require('./src/finance')

const app = express()
const PORT = process.env.PORT || 3201

app.use(cors())
app.use(express.json())

function normalizeText(value) {
  return String(value || '').trim()
}

function getDepartmentOrThrow(data, departmentId) {
  const department = data.departments.find((item) => item.id === departmentId)

  if (!department) {
    const error = new Error('部门不存在')
    error.statusCode = 404
    throw error
  }

  return department
}

function getEmployeeOrThrow(data, employeeId, quarter) {
  const employee = (data.quarterlyMembers || []).find(
    (item) => item.id === employeeId && item.quarter === quarter,
  )

  if (!employee) {
    const error = new Error('该季度员工不存在，请先导入人员名单')
    error.statusCode = 404
    throw error
  }

  return employee
}

function getEmployeeByNameOrThrow(data, employeeName, quarter) {
  const normalizedName = normalizeText(employeeName)
  const matchedEmployees = (data.quarterlyMembers || []).filter(
    (item) => item.quarter === quarter && item.name === normalizedName,
  )

  if (matchedEmployees.length === 0) {
    const error = new Error(`员工 ${normalizedName} 不存在，请先导入人员名单`)
    error.statusCode = 404
    throw error
  }

  if (matchedEmployees.length > 1) {
    const error = new Error(`员工 ${normalizedName} 存在重名，请改用单人选择登记`)
    error.statusCode = 400
    throw error
  }

  return matchedEmployees[0]
}

function getQuarterlyMemberByIdOrThrow(data, memberId) {
  const member = (data.quarterlyMembers || []).find((item) => item.id === memberId)

  if (!member) {
    const error = new Error('员工不存在')
    error.statusCode = 404
    throw error
  }

  return member
}

function collectExpenseDepartments(data, employees) {
  const departmentIds = Array.from(
    new Set(
      employees
        .map((item) => item.departmentId)
        .filter(Boolean),
    ),
  )

  if (departmentIds.length === 0) {
    const error = new Error('未识别到员工所属部门')
    error.statusCode = 400
    throw error
  }

  const departments = departmentIds.map((departmentId) => getDepartmentOrThrow(data, departmentId))

  return {
    departmentIds,
    departmentNames: departments.map((item) => item.name),
  }
}

function getExpenseParticipantIds(expense) {
  if (Array.isArray(expense.employeeIds) && expense.employeeIds.length > 0) {
    return expense.employeeIds
  }

  return expense.employeeId ? [expense.employeeId] : []
}

function getExpenseParticipantNames(expense) {
  if (Array.isArray(expense.employeeNames) && expense.employeeNames.length > 0) {
    return expense.employeeNames
  }

  return expense.employeeName ? [expense.employeeName] : []
}

function rebuildExpenseDepartments(data, expense) {
  const memberMap = new Map((data.quarterlyMembers || []).map((item) => [item.id, item]))
  const participantIds = getExpenseParticipantIds(expense)
  const departmentIds = Array.from(
    new Set(
      participantIds
        .map((id) => memberMap.get(id)?.departmentId)
        .filter(Boolean),
    ),
  )

  const departmentNames = departmentIds
    .map((departmentId) => data.departments.find((item) => item.id === departmentId)?.name)
    .filter(Boolean)

  expense.employeeIds = participantIds
  expense.employeeNames = getExpenseParticipantNames(expense)
  expense.departmentIds = departmentIds
  expense.departmentNames = departmentNames
  expense.departmentId = departmentIds[0] || ''
  expense.departmentName = departmentNames.join('、')
}

function deleteQuarterlyMember(data, memberId) {
  const member = getQuarterlyMemberByIdOrThrow(data, memberId)

  data.quarterlyMembers = (data.quarterlyMembers || []).filter((item) => item.id !== memberId)
  data.quarterlyExpenses = (data.quarterlyExpenses || []).filter((expense) => {
    const nextParticipantIds = getExpenseParticipantIds(expense).filter((id) => id !== member.id)
    const nextParticipantNames = getExpenseParticipantNames(expense).filter((name) => name !== member.name)
    const changed =
      nextParticipantIds.length !== getExpenseParticipantIds(expense).length ||
      nextParticipantNames.length !== getExpenseParticipantNames(expense).length

    if (!changed) {
      return true
    }

    if (nextParticipantIds.length === 0 && nextParticipantNames.length === 0) {
      return false
    }

    expense.employeeIds = nextParticipantIds
    expense.employeeNames = nextParticipantNames
    rebuildExpenseDepartments(data, expense)
    return true
  })

  return member
}

function requirePositiveNumber(value, fieldName) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    const error = new Error(`${fieldName} 必须是大于等于 0 的数字`)
    error.statusCode = 400
    throw error
  }

  return numericValue
}

function findOrCreateDepartment(data, departmentName) {
  const normalizedName = normalizeText(departmentName)

  if (!normalizedName) {
    const error = new Error('导入数据中存在空部门')
    error.statusCode = 400
    throw error
  }

  const existing = data.departments.find((item) => item.name === normalizedName)

  if (existing) {
    return existing
  }

  const department = {
    id: createId('dept'),
    name: normalizedName,
  }

  data.departments.push(department)
  return department
}

function parseImportContent(content) {
  return normalizeText(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const segments = line
        .split(/,|，|\t/)
        .map((item) => item.trim())
        .filter(Boolean)

      if (segments.length < 2) {
        const whitespaceSegments = line.split(/\s+/).filter(Boolean)

        if (whitespaceSegments.length >= 2) {
          return {
            name: whitespaceSegments[0],
            departmentName: whitespaceSegments.slice(1).join(' '),
          }
        }

        const error = new Error(`第 ${index + 1} 行格式错误，请按“姓名,部门”导入`)
        error.statusCode = 400
        throw error
      }

      return {
        name: segments[0],
        departmentName: segments.slice(1).join(' '),
      }
    })
}

function parseEmployeeNamesInput(value) {
  return Array.from(
    new Set(
      normalizeText(value)
        .split(/\r?\n|,|，|;/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function removeRecordByTypeAndId(data, type, id) {
  if (type === 'quarterly') {
    const beforeCount = (data.quarterlyExpenses || []).length
    data.quarterlyExpenses = (data.quarterlyExpenses || []).filter((item) => item.id !== id)

    if (data.quarterlyExpenses.length === beforeCount) {
      const error = new Error('季度团建记录不存在')
      error.statusCode = 404
      throw error
    }

    return
  }

  if (type === 'innovation') {
    const beforeCount = (data.innovationProjects || []).length
    data.innovationProjects = (data.innovationProjects || []).filter((item) => item.id !== id)

    if (data.innovationProjects.length === beforeCount) {
      const error = new Error('创新专项记录不存在')
      error.statusCode = 404
      throw error
    }

    return
  }

  const error = new Error('不支持的记录类型')
  error.statusCode = 400
  throw error
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/options', (_req, res) => {
  const data = readStore()
  const dashboard = buildDashboard(data)
  res.json(dashboard.options)
})

app.get('/api/dashboard', (req, res) => {
  const data = readStore()
  const payload = buildDashboard(data, req.query.quarter, req.query.departmentId)
  res.json(payload)
})

app.get('/api/records', (req, res) => {
  const data = readStore()
  const payload = buildRecordList(data, {
    quarter: req.query.quarter,
    departmentId: req.query.departmentId || 'all',
    type: req.query.type || 'all',
  })
  res.json(payload)
})

app.delete('/api/records/:type/:id', (req, res, next) => {
  try {
    const { type, id } = req.params
    const data = readStore()

    removeRecordByTypeAndId(data, type, id)
    writeStore(data)

    res.json({
      message: '记录已删除',
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/records/batch-delete', (req, res, next) => {
  try {
    const { records } = req.body
    const data = readStore()

    if (!Array.isArray(records) || records.length === 0) {
      const error = new Error('请先选择要删除的记录')
      error.statusCode = 400
      throw error
    }

    records.forEach((item) => {
      removeRecordByTypeAndId(data, normalizeText(item.type), normalizeText(item.id))
    })

    writeStore(data)

    res.json({
      message: `已批量删除 ${records.length} 条记录`,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/quarterly-members/import', (req, res, next) => {
  try {
    const { quarter, content } = req.body
    const data = readStore()

    if (!isValidQuarter(quarter)) {
      const error = new Error('季度格式必须为 YYYY-QN，例如 2026-Q2')
      error.statusCode = 400
      throw error
    }

    if (!normalizeText(content)) {
      const error = new Error('请粘贴导入内容，格式为“姓名,部门”')
      error.statusCode = 400
      throw error
    }

    const parsedRows = parseImportContent(content)
    const uniqueRows = new Map()

    parsedRows.forEach((row) => {
      const key = `${quarter}::${normalizeText(row.name)}`
      uniqueRows.set(key, row)
    })

    Array.from(uniqueRows.values()).forEach((row) => {
      const department = findOrCreateDepartment(data, row.departmentName)
      const employeeName = normalizeText(row.name)
      const existing = (data.quarterlyMembers || []).find(
        (item) => item.quarter === quarter && item.name === employeeName,
      )

      if (existing) {
        existing.departmentId = department.id
      } else {
        data.quarterlyMembers.push({
          id: createId('member'),
          quarter,
          name: employeeName,
          departmentId: department.id,
          createdAt: new Date().toISOString(),
        })
      }
    })

    writeStore(data)

    res.status(201).json({
      message: `已导入 ${uniqueRows.size} 条人员数据`,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/quarter-configs', (req, res, next) => {
  try {
    const { departmentId, quarter, headcount } = req.body
    const data = readStore()

    getDepartmentOrThrow(data, departmentId)

    if (!isValidQuarter(quarter)) {
      const error = new Error('季度格式必须为 YYYY-QN，例如 2026-Q2')
      error.statusCode = 400
      throw error
    }

    const safeHeadcount = requirePositiveNumber(headcount, '部门人数')
    const existing = (data.quarterConfigs || []).find(
      (item) => item.departmentId === departmentId && item.quarter === quarter,
    )

    if (existing) {
      existing.headcount = safeHeadcount
    } else {
      data.quarterConfigs.push({
        id: createId('hc'),
        departmentId,
        quarter,
        headcount: safeHeadcount,
      })
    }

    writeStore(data)

    res.status(201).json({
      message: '季度人数已保存',
      budgetRule: `${safeHeadcount} x ${QUARTERLY_ALLOWANCE} 元`,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/quarterly-expenses', (req, res, next) => {
  try {
    const { employeeNamesText, quarter, title, amount, spentDate, note } = req.body
    const data = readStore()

    if (!isValidQuarter(quarter)) {
      const error = new Error('季度格式必须为 YYYY-QN，例如 2026-Q2')
      error.statusCode = 400
      throw error
    }

    if (!spentDate) {
      const error = new Error('请填写支出日期')
      error.statusCode = 400
      throw error
    }

    const safeAmount = requirePositiveNumber(amount, '核销金额')
    const employeeNames = parseEmployeeNamesInput(employeeNamesText)
    if (employeeNames.length === 0) {
      const error = new Error('请粘贴员工姓名后再登记')
      error.statusCode = 400
      throw error
    }

    const employees = employeeNames.map((name) => getEmployeeByNameOrThrow(data, name, quarter))
    const { departmentIds, departmentNames } = collectExpenseDepartments(data, employees)

    data.quarterlyExpenses.push({
      id: createId('qe'),
      quarter,
      title: normalizeText(title) || '季度团建',
      amount: safeAmount,
      spentDate,
      note: normalizeText(note),
      departmentId: departmentIds[0],
      departmentName: departmentNames.join('、'),
      departmentIds,
      departmentNames,
      employeeIds: employees.map((item) => item.id),
      employeeNames: employees.map((item) => item.name),
      createdAt: new Date().toISOString(),
    })

    writeStore(data)
    res.status(201).json({
      message: `已登记 1 条季度团建记录，覆盖 ${employees.length} 位员工`,
    })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/quarterly-members/:memberId/status', (req, res, next) => {
  try {
    const { memberId } = req.params
    const { status } = req.body
    const data = readStore()
    const member = getQuarterlyMemberByIdOrThrow(data, memberId)
    const normalizedStatus = normalizeText(status)

    if (!['已使用', '未使用'].includes(normalizedStatus)) {
      const error = new Error('状态仅支持“已使用”或“未使用”')
      error.statusCode = 400
      throw error
    }

    member.statusOverride = normalizedStatus
    writeStore(data)

    res.json({
      message: `已更新 ${member.name} 的状态为${normalizedStatus}`,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/quarterly-members/batch-delete', (req, res, next) => {
  try {
    const { memberIds } = req.body
    const data = readStore()

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      const error = new Error('请先选择要删除的员工')
      error.statusCode = 400
      throw error
    }

    memberIds.forEach((memberId) => {
      deleteQuarterlyMember(data, normalizeText(memberId))
    })

    writeStore(data)

    res.json({
      message: `已批量删除 ${memberIds.length} 位员工`,
    })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/quarterly-members/:memberId', (req, res, next) => {
  try {
    const { memberId } = req.params
    const data = readStore()
    const member = deleteQuarterlyMember(data, memberId)

    writeStore(data)

    res.json({
      message: `已删除员工 ${member.name}`,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/innovation-projects', (req, res, next) => {
  try {
    const {
      departmentId,
      quarter,
      title,
      approvedAmount,
      reimbursedAmount,
      status,
      applyDate,
      reimburseDate,
      note,
    } = req.body
    const data = readStore()

    getDepartmentOrThrow(data, departmentId)

    if (!isValidQuarter(quarter)) {
      const error = new Error('季度格式必须为 YYYY-QN，例如 2026-Q2')
      error.statusCode = 400
      throw error
    }

    if (!normalizeText(title)) {
      const error = new Error('请填写创新专项名称')
      error.statusCode = 400
      throw error
    }

    if (!applyDate) {
      const error = new Error('请填写申请日期')
      error.statusCode = 400
      throw error
    }

    data.innovationProjects.push({
      id: createId('ip'),
      departmentId,
      quarter,
      title: normalizeText(title),
      approvedAmount: requirePositiveNumber(approvedAmount, '申请金额'),
      reimbursedAmount: requirePositiveNumber(reimbursedAmount, '已核销金额'),
      status: normalizeText(status) || '进行中',
      applyDate,
      reimburseDate: reimburseDate || '',
      note: normalizeText(note),
      createdAt: new Date().toISOString(),
    })

    writeStore(data)
    res.status(201).json({ message: '创新专项记录已录入' })
  } catch (error) {
    next(error)
  }
})

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500
  res.status(statusCode).json({
    message: error.message || '服务异常',
  })
})

app.listen(PORT, () => {
  console.log(`Team building budget backend running on http://localhost:${PORT}`)
})
