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
  employeeId: '',
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

function RecordsPanel({ records, loading }) {
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
        {loading && <span>刷新中...</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
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
            </tr>
          </thead>
          <tbody>
            {records.items.map((item) => (
              <tr key={item.id}>
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
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [quarterlyImportForm, setQuarterlyImportForm] = useState(initialQuarterlyImportForm)
  const [quarterlyForm, setQuarterlyForm] = useState(initialQuarterlyForm)
  const [innovationForm, setInnovationForm] = useState(initialInnovationForm)
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
      const defaultEmployeeId = dashboardData.quarterlyEmployeeOptions?.[0]?.id || ''

      setQuarterlyImportForm((current) => ({
        ...current,
        quarter: current.quarter || effectiveQuarter,
      }))
      setQuarterlyForm((current) => ({
        ...current,
        employeeId: dashboardData.quarterlyEmployeeOptions?.some((item) => item.id === current.employeeId)
          ? current.employeeId
          : defaultEmployeeId,
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

  const departmentOptions = dashboard?.options?.departments || []
  const quarterOptions = dashboard?.options?.quarters || []
  const quarterlySummary = dashboard?.typeSummary?.find((item) => item.key === 'quarterly')
  const innovationSummary = dashboard?.typeSummary?.find((item) => item.key === 'innovation')
  const quarterlyEmployeeOptions = dashboard?.quarterlyEmployeeOptions || []
  const quarterlyMemberStats = dashboard?.quarterlyMemberStats || []
  const quarterlyMemberSummary = dashboard?.quarterlyMemberSummary || emptyQuarterlyMemberSummary

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
  const selectedEmployee = quarterlyEmployeeOptions.find((item) => item.id === quarterlyForm.employeeId)
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

        {activeView === 'home' && <RecordsPanel records={records} loading={loading} />}

        {activeView === 'quarterly' && (
          <div className="section-stack">
            <section className="hero-panel">
              <div className="hero-copy">
                <span className="eyebrow">Quarterly Team Building</span>
                <h1>季度团建</h1>
                <p>
                  先导入季度人员名单，再按员工记录团建使用情况。
                  系统会自动按人扣减 150 元额度，并区分谁已使用、谁未使用。
                </p>
              </div>
              <div className="hero-rule">
                <div>
                  <strong>导入口径</strong>
                  <span>导入格式为“姓名,部门”，导入后自动折算季度预算。</span>
                </div>
                <div>
                  <strong>按人扣减</strong>
                  <span>每位员工每季度默认额度 150 元，登记支出后自动扣减剩余额度。</span>
                </div>
              </div>
            </section>

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
              <div className="panel">
                <SectionTitle
                  eyebrow="季度团建"
                  title="导入人员名单"
                  description="支持粘贴或上传 CSV/TXT，格式为“姓名,部门”，一行一条。"
                />
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
              </div>

              <div className="panel">
                <SectionTitle
                  eyebrow="季度团建"
                  title="按人登记团建使用"
                  description="支持单人选择或批量粘贴姓名登记，系统会按人校验本季度剩余额度。"
                />
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
                    填写批量姓名后，本次登记的事项、金额、日期和备注会同时应用到这些员工。
                  </p>
                  <select
                    value={quarterlyForm.employeeId}
                    onChange={(event) =>
                      setQuarterlyForm((current) => ({ ...current, employeeId: event.target.value }))
                    }
                  >
                    {quarterlyEmployeeOptions.length === 0 && <option value="">请先导入人员名单</option>}
                    {quarterlyEmployeeOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} / {item.departmentName}
                      </option>
                    ))}
                  </select>
                  {!hasBatchEmployeeNames && selectedEmployee && (
                    <div className="hint-box">
                      <span>当前剩余额度</span>
                      <strong>{formatMoney(selectedEmployee.remaining)}</strong>
                    </div>
                  )}
                  {hasBatchEmployeeNames && (
                    <div className="hint-box">
                      <span>批量登记</span>
                      <strong>将按姓名逐人登记并扣减额度</strong>
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
                    placeholder="支出事项"
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
                      quarterlyEmployeeOptions.length === 0 ||
                      (!quarterlyForm.employeeId && !hasBatchEmployeeNames)
                    }
                  >
                    登记使用
                  </button>
                </form>
              </div>
            </section>

            <section className="panel">
              <SectionTitle
                eyebrow="季度团建"
                title="员工额度看板"
                description="只保留人员、部门、季度和状态，方便快速查看本季度使用情况。"
              />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>人员</th>
                      <th>部门</th>
                      <th>季度</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quarterlyMemberStats.map((item) => (
                      <tr key={item.employeeId}>
                        <td>{item.employeeName}</td>
                        <td>{item.departmentName}</td>
                        <td>{selectedQuarterLabel}</td>
                        <td>{item.status}</td>
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

            <RecordsPanel records={records} loading={loading} />
          </div>
        )}

        {activeView === 'innovation' && (
          <div className="section-stack">
            <section className="hero-panel">
              <div className="hero-copy">
                <span className="eyebrow">Innovation Funding</span>
                <h1>创新专项</h1>
                <p>
                  这里只展示创新专项相关内容，包括专项概览、申请与核销录入，
                  以及当前分组下的专项明细。
                </p>
              </div>
              <div className="hero-rule">
                <div>
                  <strong>独立申请</strong>
                  <span>创新案例专项经费单独申请，不占用季度团建预算。</span>
                </div>
                <div>
                  <strong>独立核销</strong>
                  <span>专项核销与季度团建分开统计，便于单独追踪专项进度。</span>
                </div>
              </div>
            </section>

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

            <RecordsPanel records={records} loading={loading} />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
