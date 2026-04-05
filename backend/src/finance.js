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

  ;(data.quarterConfigs || []).forEach((item) => values.add(item.quarter))
  ;(data.quarterlyMembers || []).forEach((item) => values.add(item.quarter))
  ;(data.quarterlyExpenses || []).forEach((item) => values.add(item.quarter))
  ;(data.innovationProjects || []).forEach((item) => values.add(item.quarter))

  return Array.from(values).sort(sortQuarterDesc)
}

function getDepartmentMap(data) {
  return new Map(data.departments.map((department) => [department.id, department]))
}

function getQuarterlyMembers(data, quarter, departmentId = 'all') {
  return (data.quarterlyMembers || [])
    .filter((item) => item.quarter === quarter)
    .filter((item) => departmentId === 'all' || item.departmentId === departmentId)
}

function getQuarterlyExpenses(data, quarter, departmentId = 'all') {
  return (data.quarterlyExpenses || [])
    .filter((item) => item.quarter === quarter)
    .filter((item) => {
      if (departmentId === 'all') {
        return true
      }

      const departmentIds = getExpenseDepartmentIds(item)
      return departmentIds.includes(departmentId)
    })
}

function getExpenseParticipantIds(expense) {
  if (Array.isArray(expense.employeeIds) && expense.employeeIds.length > 0) {
    return expense.employeeIds
  }

  return expense.employeeId ? [expense.employeeId] : []
}

function getExpenseParticipantNames(expense, memberMap) {
  if (Array.isArray(expense.employeeNames) && expense.employeeNames.length > 0) {
    return expense.employeeNames
  }

  const participantIds = getExpenseParticipantIds(expense)

  if (participantIds.length > 0) {
    return participantIds
      .map((id) => memberMap.get(id)?.name)
      .filter(Boolean)
  }

  return expense.employeeName ? [expense.employeeName] : []
}

function getExpenseDepartmentIds(expense) {
  if (Array.isArray(expense.departmentIds) && expense.departmentIds.length > 0) {
    return expense.departmentIds
  }

  return expense.departmentId ? [expense.departmentId] : []
}

function getExpenseDepartmentNames(expense, departmentMap) {
  if (Array.isArray(expense.departmentNames) && expense.departmentNames.length > 0) {
    return expense.departmentNames
  }

  const departmentIds = getExpenseDepartmentIds(expense)

  if (departmentIds.length > 0) {
    return departmentIds
      .map((id) => departmentMap.get(id)?.name)
      .filter(Boolean)
  }

  return expense.departmentName ? [expense.departmentName] : []
}

function buildQuarterlyMemberStats(data, quarter, departmentId = 'all') {
  const departmentMap = getDepartmentMap(data)
  const members = getQuarterlyMembers(data, quarter, departmentId)
  const memberMap = new Map((data.quarterlyMembers || []).map((item) => [item.id, item]))
  const quarterlyExpenses = getQuarterlyExpenses(data, quarter)

  return members
    .map((member) => {
      const expenses = quarterlyExpenses.filter((item) => {
        const participantIds = getExpenseParticipantIds(item)
        const participantNames = getExpenseParticipantNames(item, memberMap)

        return participantIds.includes(member.id) || participantNames.includes(member.name)
      })

      const derivedUsed = expenses.length > 0
      const statusOverride = member.statusOverride === '已使用' || member.statusOverride === '未使用'
        ? member.statusOverride
        : ''
      const used = statusOverride ? statusOverride === '已使用' : derivedUsed
      const spent = used ? QUARTERLY_ALLOWANCE : 0
      const remaining = used ? 0 : QUARTERLY_ALLOWANCE

      return {
        employeeId: member.id,
        employeeName: member.name,
        departmentId: member.departmentId,
        departmentName: departmentMap.get(member.departmentId)?.name || '未知部门',
        quarter,
        allowance: QUARTERLY_ALLOWANCE,
        spent,
        remaining,
        expenseCount: expenses.length,
        used,
        statusValue: used ? '已使用' : '未使用',
        statusOverride,
        status: used ? '已使用' : '未使用',
      }
    })
    .sort((left, right) => {
      if (left.departmentName !== right.departmentName) {
        return left.departmentName.localeCompare(right.departmentName, 'zh-CN')
      }

      return left.employeeName.localeCompare(right.employeeName, 'zh-CN')
    })
}

function buildDepartmentStats(data, quarter, departmentId = 'all') {
  const departmentMap = getDepartmentMap(data)
  const memberStats = buildQuarterlyMemberStats(data, quarter, departmentId)
  const departments = departmentId === 'all'
    ? data.departments
    : data.departments.filter((department) => department.id === departmentId)

  return departments.map((department) => {
    const departmentMembers = memberStats.filter((item) => item.departmentId === department.id)
    const quarterlyExpenses = getQuarterlyExpenses(data, quarter, department.id)
    const fallbackConfig = (data.quarterConfigs || []).find(
      (item) => item.departmentId === department.id && item.quarter === quarter,
    )

    const headcount = departmentMembers.length || fallbackConfig?.headcount || 0
    const quarterlyBudget = headcount * QUARTERLY_ALLOWANCE
    const quarterlySpent = quarterlyExpenses.reduce((sum, item) => {
      const participantIds = getExpenseParticipantIds(item)
      const participantCount = participantIds.length || 1
      const departmentParticipantCount = departmentMembers.filter((member) =>
        participantIds.includes(member.employeeId || member.id),
      ).length

      if (departmentParticipantCount === 0) {
        return sum
      }

      return sum + (Number(item.amount || 0) * departmentParticipantCount) / participantCount
    }, 0)
    const quarterlyRemaining = quarterlyBudget - quarterlySpent
    const usedMemberCount = departmentMembers.filter((item) => item.used).length
    const unusedMemberCount = Math.max(headcount - usedMemberCount, 0)
    const innovationProjects = (data.innovationProjects || []).filter(
      (item) => item.departmentId === department.id && item.quarter === quarter,
    )
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
      departmentName: departmentMap.get(department.id)?.name || department.name,
      quarter,
      headcount,
      quarterlyBudget,
      quarterlySpent,
      quarterlyRemaining,
      usedMemberCount,
      unusedMemberCount,
      innovationApproved,
      innovationReimbursed,
      quarterlyExpenseCount: quarterlyExpenses.length,
      innovationProjectCount: innovationProjects.length,
    }
  })
}

function buildQuarterlyMemberSummary(memberStats) {
  const usedMembers = memberStats.filter((item) => item.used).length
  const totalMembers = memberStats.length
  const totalAllowance = totalMembers * QUARTERLY_ALLOWANCE
  const totalRemaining = (totalMembers - usedMembers) * QUARTERLY_ALLOWANCE

  return {
    totalMembers,
    usedMembers,
    unusedMembers: Math.max(totalMembers - usedMembers, 0),
    totalAllowance,
    totalSpent: totalAllowance - totalRemaining,
    totalRemaining,
  }
}

function buildDashboard(data, requestedQuarter, requestedDepartmentId = 'all') {
  const availableQuarters = getAvailableQuarters(data)
  const currentQuarter = getQuarterFromDate()
  const selectedQuarter = availableQuarters.includes(requestedQuarter)
    ? requestedQuarter
    : (availableQuarters.includes(currentQuarter) ? currentQuarter : availableQuarters[0] || currentQuarter)
  const selectedDepartmentId = requestedDepartmentId || 'all'
  const departmentStats = buildDepartmentStats(data, selectedQuarter, selectedDepartmentId)
  const quarterlyMemberStats = buildQuarterlyMemberStats(data, selectedQuarter, selectedDepartmentId)
  const quarterlyMemberSummary = buildQuarterlyMemberSummary(quarterlyMemberStats)

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
    quarterlyMemberStats,
    quarterlyMemberSummary,
    quarterlyEmployeeOptions: quarterlyMemberStats.map((item) => ({
      id: item.employeeId,
      name: item.employeeName,
      departmentId: item.departmentId,
      departmentName: item.departmentName,
      remaining: item.remaining,
    })),
    options: {
      quarters: availableQuarters,
      departments: data.departments,
    },
  }
}

function buildRecordList(data, filters) {
  const departmentMap = getDepartmentMap(data)
  const memberMap = new Map((data.quarterlyMembers || []).map((item) => [item.id, item]))
  const { quarter, departmentId = 'all', type = 'all' } = filters

  const quarterlyItems = (data.quarterlyExpenses || [])
    .filter((item) => (!quarter || item.quarter === quarter))
    .filter((item) => {
      if (departmentId === 'all') {
        return true
      }

      return getExpenseDepartmentIds(item).includes(departmentId)
    })
    .map((item) => ({
      id: item.id,
      quarter: item.quarter,
      departmentId: item.departmentId,
      departmentName: getExpenseDepartmentNames(item, departmentMap).join('、') || '未知部门',
      employeeName: getExpenseParticipantNames(item, memberMap).join('、') || '-',
      type: 'quarterly',
      typeLabel: '季度团建',
      title: item.title || '季度团建',
      status: '已登记',
      approvedAmount: Number(item.amount || 0),
      reimbursedAmount: Number(item.amount || 0),
      date: item.spentDate,
      note: item.note || '',
    }))

  const innovationItems = (data.innovationProjects || [])
    .filter((item) => (!quarter || item.quarter === quarter))
    .filter((item) => departmentId === 'all' || item.departmentId === departmentId)
    .map((item) => ({
      id: item.id,
      quarter: item.quarter,
      departmentId: item.departmentId,
      departmentName: departmentMap.get(item.departmentId)?.name || '未知部门',
      employeeName: '-',
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
  buildQuarterlyMemberStats,
  isValidQuarter,
}
