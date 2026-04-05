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
    const { employeeId, employeeNamesText, quarter, title, amount, spentDate, note } = req.body
    const data = readStore()

    if (!isValidQuarter(quarter)) {
      const error = new Error('季度格式必须为 YYYY-QN，例如 2026-Q2')
      error.statusCode = 400
      throw error
    }

    if (!normalizeText(title)) {
      const error = new Error('请填写支出事项')
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
    const employees = employeeNames.length > 0
      ? employeeNames.map((name) => getEmployeeByNameOrThrow(data, name, quarter))
      : [getEmployeeOrThrow(data, employeeId, quarter)]

    employees.forEach((employee) => {
      const spentBefore = (data.quarterlyExpenses || [])
        .filter((item) => item.quarter === quarter && item.employeeId === employee.id)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0)

      if (spentBefore + safeAmount > QUARTERLY_ALLOWANCE) {
        const remaining = QUARTERLY_ALLOWANCE - spentBefore
        const error = new Error(`员工 ${employee.name} 本季度剩余额度不足，当前仅剩 ${remaining} 元`)
        error.statusCode = 400
        throw error
      }
    })

    employees.forEach((employee) => {
      data.quarterlyExpenses.push({
        id: createId('qe'),
        employeeId: employee.id,
        employeeName: employee.name,
        departmentId: employee.departmentId,
        quarter,
        title: normalizeText(title),
        amount: safeAmount,
        spentDate,
        note: normalizeText(note),
        createdAt: new Date().toISOString(),
      })
    })

    writeStore(data)
    res.status(201).json({
      message: employees.length > 1
        ? `已为 ${employees.length} 位员工批量登记使用`
        : '季度团建支出已录入',
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
