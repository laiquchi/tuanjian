const QUARTERLY_ALLOWANCE = 150

function getQuarterFromDate(input = new Date()) {
  const date = new Date(input)
  const month = date.getMonth()
  const quarter = Math.floor(month / 3) + 1
  return `${date.getFullYear()}-Q${quarter}`
}

function parseQuarter(quarter) {
  const [yearText, quarterText] = quarter.split('-Q')
  return {
    year: Number(yearText),
    quarter: Number(quarterText),
  }
}

function sortQuarterDesc(a, b) {
  const left = parseQuarter(a)
  const right = parseQuarter(b)

  if (left.year !== right.year) {
    return right.year - left.year
  }

  return right.quarter - left.quarter
}

function getAvailableQuarters(data) {
  const values = new Set()

  data.quarterConfigs.forEach((item) => values.add(item.quarter))
  data.quarterlyExpenses.forEach((item) => values.add(item.quarter))
  data.innovationProjects.forEach((item) => values.add(item.quarter))

  return Array.from(values).sort(sortQuarterDesc)
}

function getDepartmentMap(data) {
  return new Map(data.departments.map((department) => [department.id, department]))
}

function buildDepartmentStats(data, quarter, departmentId = 'all') {
  const departments = departmentId === 'all'
    ? data.departments
    : data.departments.filter((department) => department.id === departmentId)

  return departments.map((department) => {
    const config = data.quarterConfigs.find(
      (item) => item.departmentId === department.id && item.quarter === quarter,
    )

    const quarterlyExpenses = data.quarterlyExpenses.filter(
      (item) => item.departmentId === department.id && item.quarter === quarter,
    )

    const innovationProjects = data.innovationProjects.filter(
      (item) => item.departmentId === department.id && item.quarter === quarter,
    )

    const headcount = config?.headcount ?? 0
    const quarterlyBudget = headcount * QUARTERLY_ALLOWANCE
    const quarterlySpent = quarterlyExpenses.reduce((sum, item) => sum + Number(item.amount), 0)
    const quarterlyRemaining = quarterlyBudget - quarterlySpent
    const innovationApproved = innovationProjects.reduce(
      (sum, item) => sum + Number(item.approvedAmount || 0),
      0,
    )
    const innovationReimbursed = innovationProjects.reduce(
      (sum, item) => sum + Number(item.reimbursedAmount || 0),
      0,
    )

    return {
      departmentId: department.id,
      departmentName: department.name,
      quarter,
      headcount,
      quarterlyBudget,
      quarterlySpent,
      quarterlyRemaining,
      innovationApproved,
      innovationReimbursed,
      quarterlyExpenseCount: quarterlyExpenses.length,
      innovationProjectCount: innovationProjects.length,
    }
  })
}

function buildDashboard(data, requestedQuarter, requestedDepartmentId = 'all') {
  const availableQuarters = getAvailableQuarters(data)
  const currentQuarter = getQuarterFromDate()
  const selectedQuarter = availableQuarters.includes(requestedQuarter)
    ? requestedQuarter
    : (availableQuarters.includes(currentQuarter) ? currentQuarter : availableQuarters[0] || currentQuarter)
  const selectedDepartmentId = requestedDepartmentId || 'all'
  const departmentStats = buildDepartmentStats(data, selectedQuarter, selectedDepartmentId)

  const overview = departmentStats.reduce(
    (sum, item) => ({
      departmentCount: sum.departmentCount + 1,
      totalHeadcount: sum.totalHeadcount + item.headcount,
      quarterlyBudget: sum.quarterlyBudget + item.quarterlyBudget,
      quarterlySpent: sum.quarterlySpent + item.quarterlySpent,
      quarterlyRemaining: sum.quarterlyRemaining + item.quarterlyRemaining,
      innovationApproved: sum.innovationApproved + item.innovationApproved,
      innovationReimbursed: sum.innovationReimbursed + item.innovationReimbursed,
      quarterlyExpenseCount: sum.quarterlyExpenseCount + item.quarterlyExpenseCount,
      innovationProjectCount: sum.innovationProjectCount + item.innovationProjectCount,
    }),
    {
      departmentCount: 0,
      totalHeadcount: 0,
      quarterlyBudget: 0,
      quarterlySpent: 0,
      quarterlyRemaining: 0,
      innovationApproved: 0,
      innovationReimbursed: 0,
      quarterlyExpenseCount: 0,
      innovationProjectCount: 0,
    },
  )

  return {
    filters: {
      selectedQuarter,
      selectedDepartmentId,
      currentQuarter,
    },
    overview,
    typeSummary: [
      {
        key: 'quarterly',
        label: '季度团建',
        budget: overview.quarterlyBudget,
        spent: overview.quarterlySpent,
        remaining: overview.quarterlyRemaining,
        count: overview.quarterlyExpenseCount,
      },
      {
        key: 'innovation',
        label: '创新专项',
        approved: overview.innovationApproved,
        reimbursed: overview.innovationReimbursed,
        count: overview.innovationProjectCount,
      },
    ],
    departmentStats,
    options: {
      quarters: availableQuarters,
      departments: data.departments,
    },
  }
}

function buildRecordList(data, filters) {
  const departmentMap = getDepartmentMap(data)
  const { quarter, departmentId = 'all', type = 'all' } = filters

  const quarterlyItems = data.quarterlyExpenses
    .filter((item) => (!quarter || item.quarter === quarter))
    .filter((item) => departmentId === 'all' || item.departmentId === departmentId)
    .map((item) => ({
      id: item.id,
      quarter: item.quarter,
      departmentId: item.departmentId,
      departmentName: departmentMap.get(item.departmentId)?.name || '未知部门',
      type: 'quarterly',
      typeLabel: '季度团建',
      title: item.title,
      status: '已核销',
      approvedAmount: Number(item.amount || 0),
      reimbursedAmount: Number(item.amount || 0),
      date: item.spentDate,
      note: item.note || '',
    }))

  const innovationItems = data.innovationProjects
    .filter((item) => (!quarter || item.quarter === quarter))
    .filter((item) => departmentId === 'all' || item.departmentId === departmentId)
    .map((item) => ({
      id: item.id,
      quarter: item.quarter,
      departmentId: item.departmentId,
      departmentName: departmentMap.get(item.departmentId)?.name || '未知部门',
      type: 'innovation',
      typeLabel: '创新专项',
      title: item.title,
      status: item.status,
      approvedAmount: Number(item.approvedAmount || 0),
      reimbursedAmount: Number(item.reimbursedAmount || 0),
      date: item.reimburseDate || item.applyDate,
      note: item.note || '',
    }))

  const combined = [...quarterlyItems, ...innovationItems]
    .filter((item) => type === 'all' || item.type === type)
    .sort((left, right) => new Date(right.date) - new Date(left.date))

  return {
    items: combined,
    summary: {
      total: combined.length,
      quarterlyCount: combined.filter((item) => item.type === 'quarterly').length,
      innovationCount: combined.filter((item) => item.type === 'innovation').length,
      totalApproved: combined.reduce((sum, item) => sum + Number(item.approvedAmount || 0), 0),
      totalReimbursed: combined.reduce((sum, item) => sum + Number(item.reimbursedAmount || 0), 0),
    },
  }
}

function isValidQuarter(value) {
  return /^\d{4}-Q[1-4]$/.test(value)
}

module.exports = {
  QUARTERLY_ALLOWANCE,
  buildDashboard,
  buildRecordList,
  isValidQuarter,
}
