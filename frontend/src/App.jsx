import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import './App.css'

const initialFilters = {
  quarter: '',
  departmentId: 'all',
  type: 'all',
}

const initialQuarterlyImportForm = {
  quarter: '',
  content: '',
}

const initialQuarterlyForm = {
  employeeNamesText: '',
  quarter: '',
  title: '',
  amount: '',
  spentDate: '',
  note: '',
}

const initialInnovationForm = {
  departmentId: '',
  quarter: '',
  title: '',
  approvedAmount: '',
  reimbursedAmount: '',
  status: '进行中',
  applyDate: '',
  reimburseDate: '',
  note: '',
}

const initialMemberBoardFilters = {
  keyword: '',
  departmentId: 'all',
}

const initialQuarterlyPanelOpen = {
  import: false,
  expense: false,
}

const viewOptions = [
  {
    key: 'quarterly',
    label: '季度团建',
    description: '导入人员、按人扣减、查看剩余额度',
    type: 'quarterly',
  },
  {
    key: 'innovation',
    label: '创新专项',
    description: '专项概览、申请与核销录入',
    type: 'innovation',
  },
]

const emptyQuarterlyMemberSummary = {
  totalMembers: 0,
  usedMembers: 0,
  unusedMembers: 0,
  totalAllowance: 0,
  totalSpent: 0,
  totalRemaining: 0,
}

function formatMoney(value) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value || 0)
}

function fetchJson(url, options) {
  return fetch(url, options).then(async (response) => {
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || '请求失败')
    }

    return data
  })
}

function createRecordKey(item) {
  return `${item.type}:${item.id}`
}

function normalizeImportCell(value) {
  return String(value ?? '').trim()
}

function workbookToImportText(workbook) {
  const sheetName = workbook.SheetNames[0]

  if (!sheetName) {
    throw new Error('Excel 文件中没有可读取的工作表')
  }

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  })

  const normalizedRows = rows
    .map((row) => row.map((cell) => normalizeImportCell(cell)))
    .filter((row) => row.some(Boolean))

  if (normalizedRows.length === 0) {
    throw new Error('Excel 文件内容为空')
  }

  const [firstRow, ...dataRows] = normalizedRows
  const hasHeader = firstRow.includes('姓名') && firstRow.includes('部门')
  const effectiveRows = hasHeader ? dataRows : normalizedRows

  const lines = effectiveRows
    .map((row) => {
      const [name, department] = row
      return [normalizeImportCell(name), normalizeImportCell(department)]
    })
    .filter(([name, department]) => name && department)
    .map(([name, department]) => `${name},${department}`)

  if (lines.length === 0) {
    throw new Error('Excel 文件中未识别到“姓名、部门”两列数据')
  }

  return lines.join('\n')
}

function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="section-title">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}

function MetricCard({ label, value, help }) {
  return (
    <article className="data-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{help}</p>
    </article>
  )
}

function RecordsPanel({
  records,
  loading,
  submitting,
  selectedRecordKeys,
  onToggleRecord,
  onToggleAllRecords,
  onDeleteRecord,
  onDeleteSelected,
}) {
  const allRecordKeys = records.items.map((item) => createRecordKey(item))
  const selectedCount = allRecordKeys.filter((key) => selectedRecordKeys.includes(key)).length
  const allSelected = allRecordKeys.length > 0 && selectedCount === allRecordKeys.length

  return (
    <section className="panel">
      <SectionTitle
        eyebrow="汇总明细"
        title="当前视图记录"
        description="首页只展示汇总明细；切换到分组后，会自动只显示当前分组的记录。"
      />
      <div className="records-meta">
        <span>记录数 {records.summary.total || 0}</span>
        <span>申请合计 {formatMoney(records.summary.totalApproved || 0)}</span>
        <span>核销合计 {formatMoney(records.summary.totalReimbursed || 0)}</span>
        <button
          className="table-button danger"
          type="button"
          disabled={submitting || selectedCount === 0}
          onClick={onDeleteSelected}
        >
          批量删除{selectedCount > 0 ? `（${selectedCount}）` : ''}
        </button>
        {loading && <span>刷新中...</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allSelected}
                  disabled={allRecordKeys.length === 0 || submitting}
                  onChange={(event) => onToggleAllRecords(event.target.checked)}
                />
              </th>
              <th>日期</th>
              <th>季度</th>
              <th>部门</th>
              <th>人员</th>
              <th>类型</th>
              <th>事项</th>
              <th>状态</th>
              <th>申请金额</th>
              <th>核销金额</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {records.items.map((item) => (
              <tr key={createRecordKey(item)}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedRecordKeys.includes(createRecordKey(item))}
                    disabled={submitting}
                    onChange={(event) => onToggleRecord(item, event.target.checked)}
                  />
                </td>
                <td>{item.date || '-'}</td>
                <td>{item.quarter}</td>
                <td>{item.departmentName}</td>
                <td>{item.employeeName || '-'}</td>
                <td>
                  <span className={`tag ${item.type}`}>{item.typeLabel}</span>
                </td>
                <td>{item.title}</td>
                <td>{item.status}</td>
                <td>{formatMoney(item.approvedAmount)}</td>
                <td>{formatMoney(item.reimbursedAmount)}</td>
                <td>{item.note || '-'}</td>
                <td>
                  <button
                    className="table-button danger"
                    type="button"
                    disabled={submitting}
                    onClick={() => onDeleteRecord(item)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function App() {
  const [activeView, setActiveView] = useState('home')
  const [filters, setFilters] = useState(initialFilters)
  const [dashboard, setDashboard] = useState(null)
  const [records, setRecords] = useState({ items: [], summary: {} })
  const [selectedRecordKeys, setSelectedRecordKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [quarterlyImportForm, setQuarterlyImportForm] = useState(initialQuarterlyImportForm)
  const [quarterlyForm, setQuarterlyForm] = useState(initialQuarterlyForm)
  const [innovationForm, setInnovationForm] = useState(initialInnovationForm)
  const [memberBoardFilters, setMemberBoardFilters] = useState(initialMemberBoardFilters)
  const [quarterlyPanelOpen, setQuarterlyPanelOpen] = useState(initialQuarterlyPanelOpen)
  const { quarter, departmentId, type } = filters

  const loadDashboard = useCallback(async (nextFilters) => {
    const params = new URLSearchParams()

    if (nextFilters.quarter) {
      params.set('quarter', nextFilters.quarter)
    }

    if (nextFilters.departmentId) {
      params.set('departmentId', nextFilters.departmentId)
    }

    const data = await fetchJson(`/api/dashboard?${params.toString()}`)
    setDashboard(data)
    return data
  }, [])

  const loadRecords = useCallback(async (nextFilters) => {
    const params = new URLSearchParams()

    if (nextFilters.quarter) {
      params.set('quarter', nextFilters.quarter)
    }

    if (nextFilters.departmentId) {
      params.set('departmentId', nextFilters.departmentId)
    }

    if (nextFilters.type) {
      params.set('type', nextFilters.type)
    }

    const data = await fetchJson(`/api/records?${params.toString()}`)
    setRecords(data)
  }, [])

  const refresh = useCallback(async (nextFilters) => {
    setLoading(true)
    setError('')

    try {
      const dashboardData = await loadDashboard(nextFilters)
      const effectiveQuarter = nextFilters.quarter || dashboardData.filters.selectedQuarter
      const effectiveFilters = {
        ...nextFilters,
        quarter: effectiveQuarter,
      }

      if (filters.quarter !== effectiveQuarter) {
        setFilters((current) => ({ ...current, quarter: effectiveQuarter }))
      }

      await loadRecords(effectiveFilters)

      const defaultDepartmentId = dashboardData.options.departments[0]?.id || ''

      setQuarterlyImportForm((current) => ({
        ...current,
        quarter: current.quarter || effectiveQuarter,
      }))
      setQuarterlyForm((current) => ({
        ...current,
        quarter: current.quarter || effectiveQuarter,
      }))
      setInnovationForm((current) => ({
        ...current,
        departmentId: current.departmentId || defaultDepartmentId,
        quarter: current.quarter || effectiveQuarter,
      }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [filters.quarter, loadDashboard, loadRecords])

  useEffect(() => {
    refresh({ quarter, departmentId, type })
  }, [quarter, departmentId, type, refresh])

  useEffect(() => {
    const validKeys = new Set(records.items.map((item) => createRecordKey(item)))
    setSelectedRecordKeys((current) => current.filter((key) => validKeys.has(key)))
  }, [records])

  const departmentOptions = dashboard?.options?.departments || []
  const quarterOptions = dashboard?.options?.quarters || []
  const quarterlySummary = dashboard?.typeSummary?.find((item) => item.key === 'quarterly')
  const innovationSummary = dashboard?.typeSummary?.find((item) => item.key === 'innovation')
  const quarterlyMemberStats = useMemo(() => dashboard?.quarterlyMemberStats || [], [dashboard])
  const quarterlyMemberSummary = dashboard?.quarterlyMemberSummary || emptyQuarterlyMemberSummary
  const filteredQuarterlyMemberStats = useMemo(() => {
    const keyword = memberBoardFilters.keyword.trim().toLowerCase()

    return quarterlyMemberStats.filter((item) => {
      const matchKeyword = !keyword || item.employeeName.toLowerCase().includes(keyword)
      const matchDepartment =
        memberBoardFilters.departmentId === 'all' || item.departmentId === memberBoardFilters.departmentId

      return matchKeyword && matchDepartment
    })
  }, [memberBoardFilters.departmentId, memberBoardFilters.keyword, quarterlyMemberStats])

  const quarterlyCards = useMemo(() => {
    if (!dashboard) {
      return []
    }

    return [
      {
        label: '季度团建总预算',
        value: formatMoney(dashboard.overview.quarterlyBudget),
        help: `${dashboard.overview.totalHeadcount} 人 x 150 元`,
      },
      {
        label: '本季度已使用经费',
        value: formatMoney(dashboard.overview.quarterlySpent),
        help: `${dashboard.overview.quarterlyExpenseCount} 条团建记录`,
      },
      {
        label: '已使用人数',
        value: `${quarterlyMemberSummary.usedMembers} 人`,
        help: `未使用 ${quarterlyMemberSummary.unusedMembers} 人`,
      },
      {
        label: '本季度剩余经费',
        value: formatMoney(dashboard.overview.quarterlyRemaining),
        help: `${dashboard.overview.departmentCount} 个部门范围内自动统计`,
      },
    ]
  }, [dashboard, quarterlyMemberSummary])

  const innovationCards = useMemo(() => {
    if (!dashboard) {
      return []
    }

    return [
      {
        label: '创新专项已申请',
        value: formatMoney(dashboard.overview.innovationApproved),
        help: `${dashboard.overview.innovationProjectCount} 个专项`,
      },
      {
        label: '创新专项已核销',
        value: formatMoney(dashboard.overview.innovationReimbursed),
        help: '与季度团建独立核算',
      },
    ]
  }, [dashboard])

  const selectedDepartmentName =
    departmentOptions.find((item) => item.id === departmentId)?.name || '全部部门'
  const hasBatchEmployeeNames = quarterlyForm.employeeNamesText.trim().length > 0
  const selectedQuarterLabel = quarter || dashboard?.filters?.selectedQuarter || '-'

  const handleFilterChange = (event) => {
    const { name, value } = event.target
    startTransition(() => {
      setFilters((current) => ({ ...current, [name]: value }))
    })
  }

  const handleViewChange = (viewKey) => {
    const nextType = viewKey === 'home'
      ? 'all'
      : viewOptions.find((item) => item.key === viewKey)?.type || 'all'

    startTransition(() => {
      setActiveView(viewKey)
      setFilters((current) => ({
        ...current,
        type: nextType,
      }))
    })
  }

  const handleSubmit = async (event, endpoint, payload, resetCallback) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    setError('')

    try {
      const result = await fetchJson(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      setMessage(result.message)
      resetCallback()
      await refresh(filters)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuarterlyMemberStatusChange = async (memberId, nextStatus) => {
    setSubmitting(true)
    setMessage('')
    setError('')

    try {
      const result = await fetchJson(`/api/quarterly-members/${memberId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: nextStatus }),
      })

      setMessage(result.message)
      await refresh(filters)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuarterlyMemberDelete = async (memberId, employeeName) => {
    const shouldDelete = window.confirm(`确认删除员工“${employeeName}”吗？相关团建记录中的该员工也会被移除。`)

    if (!shouldDelete) {
      return
    }

    setSubmitting(true)
    setMessage('')
    setError('')

    try {
      const result = await fetchJson(`/api/quarterly-members/${memberId}`, {
        method: 'DELETE',
      })

      setMessage(result.message)
      await refresh(filters)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleMemberBoardFilterChange = (event) => {
    const { name, value } = event.target
    setMemberBoardFilters((current) => ({ ...current, [name]: value }))
  }

  const handleQuarterlyPanelToggle = (panelKey) => {
    setQuarterlyPanelOpen((current) => ({
      ...current,
      [panelKey]: !current[panelKey],
    }))
  }

  const handleQuarterlyMembersBatchDelete = async () => {
    if (filteredQuarterlyMemberStats.length === 0) {
      return
    }

    const filterLabel = [
      memberBoardFilters.keyword ? `姓名包含“${memberBoardFilters.keyword}”` : '',
      memberBoardFilters.departmentId !== 'all'
        ? `部门为“${departmentOptions.find((item) => item.id === memberBoardFilters.departmentId)?.name || ''}”`
        : '',
    ]
      .filter(Boolean)
      .join('，')

    const shouldDelete = window.confirm(
      `确认批量删除当前筛选到的 ${filteredQuarterlyMemberStats.length} 位员工吗？${filterLabel ? `\n筛选条件：${filterLabel}` : ''}`,
    )

    if (!shouldDelete) {
      return
    }

    setSubmitting(true)
    setMessage('')
    setError('')

    try {
      const result = await fetchJson('/api/quarterly-members/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          memberIds: filteredQuarterlyMemberStats.map((item) => item.employeeId),
        }),
      })

      setMessage(result.message)
      await refresh(filters)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRecordToggle = (record, checked) => {
    const recordKey = createRecordKey(record)

    setSelectedRecordKeys((current) => (
      checked ? Array.from(new Set([...current, recordKey])) : current.filter((key) => key !== recordKey)
    ))
  }

  const handleToggleAllRecords = (checked) => {
    setSelectedRecordKeys(checked ? records.items.map((item) => createRecordKey(item)) : [])
  }

  const handleDeleteRecord = async (record) => {
    const shouldDelete = window.confirm(`确认删除这条${record.typeLabel}记录吗？`)

    if (!shouldDelete) {
      return
    }

    setSubmitting(true)
    setMessage('')
    setError('')

    try {
      const result = await fetchJson(`/api/records/${record.type}/${record.id}`, {
        method: 'DELETE',
      })

      setMessage(result.message)
      setSelectedRecordKeys((current) => current.filter((key) => key !== createRecordKey(record)))
      await refresh(filters)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSelectedRecords = async () => {
    const selectedRecords = records.items.filter((item) => selectedRecordKeys.includes(createRecordKey(item)))

    if (selectedRecords.length === 0) {
      return
    }

    const shouldDelete = window.confirm(`确认批量删除已选中的 ${selectedRecords.length} 条记录吗？`)

    if (!shouldDelete) {
      return
    }

    setSubmitting(true)
    setMessage('')
    setError('')

    try {
      const result = await fetchJson('/api/records/batch-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: selectedRecords.map((item) => ({
            id: item.id,
            type: item.type,
          })),
        }),
      })

      setMessage(result.message)
      setSelectedRecordKeys([])
      await refresh(filters)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const extension = file.name.split('.').pop()?.toLowerCase()
      let text = ''

      if (extension === 'xls' || extension === 'xlsx') {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        text = workbookToImportText(workbook)
      } else {
        text = await file.text()
      }

      setQuarterlyImportForm((current) => ({
        ...current,
        content: text,
      }))
      setError('')
    } catch (fileError) {
      setError(fileError.message || '文件解析失败')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div className="app-layout">
      <aside className="side-nav">
        <div className="side-nav-sticky">
          <button
            className={`home-card ${activeView === 'home' ? 'active' : ''}`}
            type="button"
            onClick={() => handleViewChange('home')}
          >
            <span>Home</span>
            <strong>首页</strong>
            <p>未选择任何分组时，只显示汇总明细。</p>
          </button>

          <div className="side-summary">
            <div>
              <span>当前季度</span>
              <strong>{quarter || dashboard?.filters?.selectedQuarter || '-'}</strong>
            </div>
            <div>
              <span>当前部门</span>
              <strong>{selectedDepartmentName}</strong>
            </div>
          </div>

          <nav className="nav-groups" aria-label="页面导航">
            {viewOptions.map((group) => (
              <button
                className={`nav-group-button ${activeView === group.key ? 'active' : ''}`}
                key={group.key}
                type="button"
                onClick={() => handleViewChange(group.key)}
              >
                <span>{group.label}</span>
                <strong>{group.description}</strong>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <main className="page-shell">
        <section className="filters-panel">
          <SectionTitle
            eyebrow="筛选视图"
            title="按季度、部门查看"
            description="分组切换决定显示哪个业务区，筛选条件决定当前业务区的数据范围。"
          />
          <div className="filters-grid compact">
            <label>
              <span>季度</span>
              <select name="quarter" value={filters.quarter} onChange={handleFilterChange}>
                {quarterOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>部门</span>
              <select name="departmentId" value={filters.departmentId} onChange={handleFilterChange}>
                <option value="all">全部部门</option>
                {departmentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}

        {activeView === 'home' && (
          <RecordsPanel
            records={records}
            loading={loading}
            submitting={submitting}
            selectedRecordKeys={selectedRecordKeys}
            onToggleRecord={handleRecordToggle}
            onToggleAllRecords={handleToggleAllRecords}
            onDeleteRecord={handleDeleteRecord}
            onDeleteSelected={handleDeleteSelectedRecords}
          />
        )}

        {activeView === 'quarterly' && (
          <div className="section-stack">
            <section className="panel">
              <SectionTitle
                eyebrow="季度团建"
                title="预算概览"
                description="按导入人数自动计算预算，并统计已使用人数、未使用人数和剩余额度。"
              />
              <div className="cards-grid quarterly-grid">
                {quarterlyCards.map((item) => (
                  <MetricCard key={item.label} {...item} />
                ))}
              </div>
              {quarterlySummary && (
                <div className="summary-band quarterly-band">
                  <span>总人数 {quarterlyMemberSummary.totalMembers}</span>
                  <span>已使用 {quarterlyMemberSummary.usedMembers}</span>
                  <span>未使用 {quarterlyMemberSummary.unusedMembers}</span>
                  <span>剩余 {formatMoney(quarterlySummary.remaining)}</span>
                </div>
              )}
            </section>

            <section className="forms-grid">
              <div className={`panel collapsible-panel ${quarterlyPanelOpen.import ? 'expanded' : 'collapsed'}`}>
                <div className="collapsible-head">
                  <SectionTitle
                    eyebrow="季度团建"
                    title="导入人员名单"
                    description="支持粘贴或上传 CSV/TXT，格式为“姓名,部门”，一行一条。"
                  />
                  <button
                    className="panel-toggle"
                    type="button"
                    onClick={() => handleQuarterlyPanelToggle('import')}
                  >
                    {quarterlyPanelOpen.import ? '收起' : '展开'}
                  </button>
                </div>
                {quarterlyPanelOpen.import && (
                  <form
                    className="entry-form"
                    onSubmit={(event) =>
                      handleSubmit(
                        event,
                        '/api/quarterly-members/import',
                        quarterlyImportForm,
                        () => setQuarterlyImportForm((current) => ({ ...current, content: '' })),
                      )}
                  >
                    <input
                      value={quarterlyImportForm.quarter}
                      placeholder="2026-Q2"
                      onChange={(event) =>
                        setQuarterlyImportForm((current) => ({ ...current, quarter: event.target.value }))
                      }
                    />
                    <label className="upload-box">
                      <span>上传名单文件</span>
                      <input type="file" accept=".csv,.txt,.xls,.xlsx" onChange={handleImportFile} />
                    </label>
                    <textarea
                      rows="8"
                      value={quarterlyImportForm.content}
                      placeholder={'支持 TXT / CSV / XLS / XLSX\n张三,研发部\n李四,运营部'}
                      onChange={(event) =>
                        setQuarterlyImportForm((current) => ({ ...current, content: event.target.value }))
                      }
                    />
                    <button disabled={submitting}>导入人员</button>
                  </form>
                )}
              </div>

              <div className={`panel collapsible-panel ${quarterlyPanelOpen.expense ? 'expanded' : 'collapsed'}`}>
                <div className="collapsible-head">
                  <SectionTitle
                    eyebrow="季度团建"
                    title="按人登记团建使用"
                    description="只需粘贴员工姓名登记，支持不同部门员工一起提交，系统会自动汇总部门并生成一条团建记录。"
                  />
                  <button
                    className="panel-toggle"
                    type="button"
                    onClick={() => handleQuarterlyPanelToggle('expense')}
                  >
                    {quarterlyPanelOpen.expense ? '收起' : '展开'}
                  </button>
                </div>
                {quarterlyPanelOpen.expense && (
                  <form
                    className="entry-form"
                    onSubmit={(event) =>
                      handleSubmit(
                        event,
                        '/api/quarterly-expenses',
                        quarterlyForm,
                        () =>
                          setQuarterlyForm((current) => ({
                            ...current,
                            employeeNamesText: '',
                            title: '',
                            amount: '',
                            spentDate: '',
                            note: '',
                          })),
                      )}
                  >
                    <textarea
                      rows="4"
                      value={quarterlyForm.employeeNamesText}
                      placeholder={'批量员工姓名，支持换行、逗号分隔\n张晨\n李璐\n王哲'}
                      onChange={(event) =>
                        setQuarterlyForm((current) => ({ ...current, employeeNamesText: event.target.value }))
                      }
                    />
                    <p className="entry-help">
                      可以一次粘贴多个部门的员工姓名，登记后会生成 1 条记录，并自动汇总部门和人员名单。
                    </p>
                    {hasBatchEmployeeNames && (
                      <div className="hint-box">
                        <span>批量登记</span>
                        <strong>将生成 1 条记录，部门处会自动显示多个部门</strong>
                      </div>
                    )}
                    <input
                      value={quarterlyForm.quarter}
                      placeholder="2026-Q2"
                      onChange={(event) =>
                        setQuarterlyForm((current) => ({ ...current, quarter: event.target.value }))
                      }
                    />
                    <input
                      value={quarterlyForm.title}
                      placeholder="团建事项（可选）"
                      onChange={(event) =>
                        setQuarterlyForm((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      value={quarterlyForm.amount}
                      placeholder="核销金额"
                      onChange={(event) =>
                        setQuarterlyForm((current) => ({ ...current, amount: event.target.value }))
                      }
                    />
                    <input
                      type="date"
                      value={quarterlyForm.spentDate}
                      onChange={(event) =>
                        setQuarterlyForm((current) => ({ ...current, spentDate: event.target.value }))
                      }
                    />
                    <textarea
                      rows="3"
                      value={quarterlyForm.note}
                      placeholder="备注"
                      onChange={(event) =>
                        setQuarterlyForm((current) => ({ ...current, note: event.target.value }))
                      }
                    />
                    <button
                      disabled={
                        submitting ||
                        quarterlyMemberStats.length === 0 ||
                        !hasBatchEmployeeNames
                      }
                    >
                      登记使用
                    </button>
                  </form>
                )}
              </div>
            </section>

            <section className="panel">
              <SectionTitle
                eyebrow="季度团建"
                title="员工额度看板"
                description="支持按姓名、部门筛选后批量删除，也可以单独修改状态或删除员工。"
              />
              <div className="filters-grid compact member-board-tools">
                <label>
                  <span>姓名筛选</span>
                  <input
                    name="keyword"
                    value={memberBoardFilters.keyword}
                    placeholder="输入员工姓名关键词"
                    onChange={handleMemberBoardFilterChange}
                  />
                </label>
                <label>
                  <span>部门筛选</span>
                  <select
                    name="departmentId"
                    value={memberBoardFilters.departmentId}
                    onChange={handleMemberBoardFilterChange}
                  >
                    <option value="all">全部部门</option>
                    {departmentOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="records-meta">
                <span>筛选结果 {filteredQuarterlyMemberStats.length} 人</span>
                <button
                  className="table-button danger"
                  type="button"
                  disabled={submitting || filteredQuarterlyMemberStats.length === 0}
                  onClick={handleQuarterlyMembersBatchDelete}
                >
                  批量删除筛选结果
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>人员</th>
                      <th>部门</th>
                      <th>季度</th>
                      <th>状态</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuarterlyMemberStats.map((item) => (
                      <tr key={item.employeeId}>
                        <td>{item.employeeName}</td>
                        <td>{item.departmentName}</td>
                        <td>{selectedQuarterLabel}</td>
                        <td>
                          <select
                            className="table-select"
                            disabled={submitting}
                            value={item.statusValue || item.status}
                            onChange={(event) =>
                              handleQuarterlyMemberStatusChange(item.employeeId, event.target.value)
                            }
                          >
                            <option value="未使用">未使用</option>
                            <option value="已使用">已使用</option>
                          </select>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="table-button danger"
                              type="button"
                              disabled={submitting}
                              onClick={() => handleQuarterlyMemberDelete(item.employeeId, item.employeeName)}
                            >
                              删除员工
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <SectionTitle
                eyebrow="季度团建"
                title="部门剩余经费"
                description="部门预算由导入人数自动折算，便于同步查看部门层面的剩余金额。"
              />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>部门</th>
                      <th>人数</th>
                      <th>季度预算</th>
                      <th>已使用</th>
                      <th>剩余</th>
                      <th>已使用人数</th>
                      <th>未使用人数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard?.departmentStats?.map((item) => (
                      <tr key={item.departmentId}>
                        <td>{item.departmentName}</td>
                        <td>{item.headcount}</td>
                        <td>{formatMoney(item.quarterlyBudget)}</td>
                        <td>{formatMoney(item.quarterlySpent)}</td>
                        <td className={item.quarterlyRemaining < 0 ? 'danger-text' : 'positive-text'}>
                          {formatMoney(item.quarterlyRemaining)}
                        </td>
                        <td>{item.usedMemberCount}</td>
                        <td>{item.unusedMemberCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <RecordsPanel
              records={records}
              loading={loading}
              submitting={submitting}
              selectedRecordKeys={selectedRecordKeys}
              onToggleRecord={handleRecordToggle}
              onToggleAllRecords={handleToggleAllRecords}
              onDeleteRecord={handleDeleteRecord}
              onDeleteSelected={handleDeleteSelectedRecords}
            />
          </div>
        )}

        {activeView === 'innovation' && (
          <div className="section-stack">
            <section className="panel">
              <SectionTitle
                eyebrow="创新专项"
                title="专项概览"
                description="查看创新专项已申请金额、已核销金额和专项数量。"
              />
              <div className="cards-grid innovation-grid">
                {innovationCards.map((item) => (
                  <MetricCard key={item.label} {...item} />
                ))}
              </div>
              {innovationSummary && (
                <div className="summary-band innovation-band">
                  <span>专项数量 {innovationSummary.count}</span>
                  <span>已申请 {formatMoney(innovationSummary.approved)}</span>
                  <span>已核销 {formatMoney(innovationSummary.reimbursed)}</span>
                </div>
              )}
            </section>

            <section className="panel">
              <SectionTitle
                eyebrow="创新专项"
                title="录入专项申请与核销"
                description="单独维护专项名称、申请金额、核销金额和处理状态。"
              />
              <form
                className="entry-form"
                onSubmit={(event) =>
                  handleSubmit(
                    event,
                    '/api/innovation-projects',
                    innovationForm,
                    () =>
                      setInnovationForm((current) => ({
                        ...current,
                        title: '',
                        approvedAmount: '',
                        reimbursedAmount: '',
                        applyDate: '',
                        reimburseDate: '',
                        note: '',
                      })),
                  )}
              >
                <div className="triple-grid">
                  <select
                    value={innovationForm.departmentId}
                    onChange={(event) =>
                      setInnovationForm((current) => ({ ...current, departmentId: event.target.value }))
                    }
                  >
                    {departmentOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={innovationForm.quarter}
                    placeholder="2026-Q2"
                    onChange={(event) =>
                      setInnovationForm((current) => ({ ...current, quarter: event.target.value }))
                    }
                  />
                  <select
                    value={innovationForm.status}
                    onChange={(event) =>
                      setInnovationForm((current) => ({ ...current, status: event.target.value }))
                    }
                  >
                    <option value="进行中">进行中</option>
                    <option value="已完成">已完成</option>
                  </select>
                </div>
                <input
                  value={innovationForm.title}
                  placeholder="专项名称"
                  onChange={(event) =>
                    setInnovationForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
                <div className="inline-grid">
                  <input
                    type="number"
                    min="0"
                    value={innovationForm.approvedAmount}
                    placeholder="申请金额"
                    onChange={(event) =>
                      setInnovationForm((current) => ({ ...current, approvedAmount: event.target.value }))
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    value={innovationForm.reimbursedAmount}
                    placeholder="已核销金额"
                    onChange={(event) =>
                      setInnovationForm((current) => ({ ...current, reimbursedAmount: event.target.value }))
                    }
                  />
                </div>
                <div className="inline-grid">
                  <input
                    type="date"
                    value={innovationForm.applyDate}
                    onChange={(event) =>
                      setInnovationForm((current) => ({ ...current, applyDate: event.target.value }))
                    }
                  />
                  <input
                    type="date"
                    value={innovationForm.reimburseDate}
                    onChange={(event) =>
                      setInnovationForm((current) => ({ ...current, reimburseDate: event.target.value }))
                    }
                  />
                </div>
                <textarea
                  rows="3"
                  value={innovationForm.note}
                  placeholder="备注"
                  onChange={(event) =>
                    setInnovationForm((current) => ({ ...current, note: event.target.value }))
                  }
                />
                <button disabled={submitting}>录入专项</button>
              </form>
            </section>

            <RecordsPanel
              records={records}
              loading={loading}
              submitting={submitting}
              selectedRecordKeys={selectedRecordKeys}
              onToggleRecord={handleRecordToggle}
              onToggleAllRecords={handleToggleAllRecords}
              onDeleteRecord={handleDeleteRecord}
              onDeleteSelected={handleDeleteSelectedRecords}
            />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
