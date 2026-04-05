const express = require('express')
const cors = require('cors')

const { readStore, writeStore, createId } = require('./src/store')
const { QUARTERLY_ALLOWANCE, buildDashboard, buildRecordList, isValidQuarter } = require('./src/finance')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

function getDepartmentOrThrow(data, departmentId) {
  const department = data.departments.find((item) => item.id === departmentId)

  if (!department) {
    const error = new Error('部门不存在')
    error.statusCode = 404
    throw error
  }

  return department
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
    const existing = data.quarterConfigs.find(
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
    const { departmentId, quarter, title, amount, spentDate, note } = req.body
    const data = readStore()

    getDepartmentOrThrow(data, departmentId)

    if (!isValidQuarter(quarter)) {
      const error = new Error('季度格式必须为 YYYY-QN，例如 2026-Q2')
      error.statusCode = 400
      throw error
    }

    if (!title || !title.trim()) {
      const error = new Error('请填写支出事项')
      error.statusCode = 400
      throw error
    }

    if (!spentDate) {
      const error = new Error('请填写支出日期')
      error.statusCode = 400
      throw error
    }

    data.quarterlyExpenses.push({
      id: createId('qe'),
      departmentId,
      quarter,
      title: title.trim(),
      amount: requirePositiveNumber(amount, '核销金额'),
      spentDate,
      note: note?.trim() || '',
      createdAt: new Date().toISOString(),
    })

    writeStore(data)
    res.status(201).json({ message: '季度团建支出已录入' })
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

    if (!title || !title.trim()) {
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
      title: title.trim(),
      approvedAmount: requirePositiveNumber(approvedAmount, '申请金额'),
      reimbursedAmount: requirePositiveNumber(reimbursedAmount, '已核销金额'),
      status: status || '进行中',
      applyDate,
      reimburseDate: reimburseDate || '',
      note: note?.trim() || '',
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
