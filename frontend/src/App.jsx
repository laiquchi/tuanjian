import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const initialFilters = {
  quarter: '',
  departmentId: 'all',
  type: 'all',
}

const initialHeadcountForm = {
  departmentId: '',
  quarter: '',
  headcount: '',
}

const initialQuarterlyForm = {
  departmentId: '',
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

function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="section-title">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  )
}

function App() {
  const [filters, setFilters] = useState(initialFilters)
  const [dashboard, setDashboard] = useState(null)
  const [records, setRecords] = useState({ items: [], summary: {} })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [headcountForm, setHeadcountForm] = useState(initialHeadcountForm)
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

  const refresh = useCallback(async (nextFilters = filters) => {
    setLoading(true)
    setError('')

    try {
      const dashboardData = await loadDashboard(nextFilters)
      const effectiveFilters = {
        ...nextFilters,
        quarter: nextFilters.quarter || dashboardData.filters.selectedQuarter,
      }

      if (filters.quarter !== effectiveFilters.quarter) {
        setFilters((current) => ({ ...current, quarter: effectiveFilters.quarter }))
      }

      await loadRecords(effectiveFilters)

      setHeadcountForm((current) => ({
        ...current,
        departmentId: current.departmentId || dashboardData.options.departments[0]?.id || '',
        quarter: current.quarter || effectiveFilters.quarter,
      }))
      setQuarterlyForm((current) => ({
        ...current,
        departmentId: current.departmentId || dashboardData.options.departments[0]?.id || '',
        quarter: current.quarter || effectiveFilters.quarter,
      }))
      setInnovationForm((current) => ({
        ...current,
        departmentId: current.departmentId || dashboardData.options.departments[0]?.id || '',
        quarter: current.quarter || effectiveFilters.quarter,
      }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [filters, loadDashboard, loadRecords])

  useEffect(() => {
    refresh(initialFilters)
  }, [refresh])

  useEffect(() => {
    if (!dashboard) {
      return
    }

    refresh({ quarter, departmentId, type })
  }, [dashboard, quarter, departmentId, refresh, type])

  const departmentOptions = dashboard?.options?.departments || []
  const quarterOptions = dashboard?.options?.quarters || []

  const overviewCards = useMemo(() => {
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
        label: '季度团建已使用',
        value: formatMoney(dashboard.overview.quarterlySpent),
        help: `${dashboard.overview.quarterlyExpenseCount} 笔核销`,
      },
      {
        label: '本季度剩余经费',
        value: formatMoney(dashboard.overview.quarterlyRemaining),
        help: `${dashboard.overview.departmentCount} 个部门范围内自动统计`,
      },
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

  const handleFilterChange = (event) => {
    const { name, value } = event.target
    startTransition(() => {
      setFilters((current) => ({ ...current, [name]: value }))
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

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow">Team Building Budget Console</span>
          <h1>团建经费记录系统</h1>
          <p>
            按部门、按季度、按类型统一查看季度团建和创新专项经费，
            自动统计本季度剩余预算，支持前后端分离部署。
          </p>
        </div>
        <div className="hero-rule">
          <div>
            <strong>季度团建</strong>
            <span>每人每季度 150 元，按部门人数自动计算预算</span>
          </div>
          <div>
            <strong>创新专项</strong>
            <span>单独申请、单独核销，不占用季度团建预算</span>
          </div>
        </div>
      </section>

      <section className="filters-panel">
        <SectionTitle
          eyebrow="筛选视图"
          title="按季度、部门、类型查看"
          description="先筛选查询范围，再看总览、部门汇总和明细记录。"
        />
        <div className="filters-grid">
          <label>
            <span>季度</span>
            <select name="quarter" value={filters.quarter} onChange={handleFilterChange}>
              {quarterOptions.map((quarter) => (
                <option key={quarter} value={quarter}>
                  {quarter}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>部门</span>
            <select name="departmentId" value={filters.departmentId} onChange={handleFilterChange}>
              <option value="all">全部部门</option>
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>类型</span>
            <select name="type" value={filters.type} onChange={handleFilterChange}>
              <option value="all">全部类型</option>
              <option value="quarterly">季度团建</option>
              <option value="innovation">创新专项</option>
            </select>
          </label>
        </div>
      </section>

      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}

      <section className="cards-grid">
        {overviewCards.map((card) => (
          <article className="data-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.help}</p>
          </article>
        ))}
      </section>

      <section className="type-summary-panel">
        {dashboard?.typeSummary?.map((item) => (
          <article className="type-card" key={item.key}>
            <div>
              <span>{item.label}</span>
              <strong>
                {item.key === 'quarterly'
                  ? formatMoney(item.remaining)
                  : formatMoney(item.reimbursed)}
              </strong>
            </div>
            <p>
              {item.key === 'quarterly'
                ? `预算 ${formatMoney(item.budget)} / 已用 ${formatMoney(item.spent)} / 剩余 ${formatMoney(item.remaining)}`
                : `申请 ${formatMoney(item.approved)} / 已核销 ${formatMoney(item.reimbursed)}`}
            </p>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <div className="panel">
          <SectionTitle
            eyebrow="部门汇总"
            title="本季度剩余团建经费"
            description="季度预算由部门人数自动折算，创新专项单独汇总。"
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
                  <th>创新申请</th>
                  <th>创新核销</th>
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
                    <td>{formatMoney(item.innovationApproved)}</td>
                    <td>{formatMoney(item.innovationReimbursed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel forms-panel">
          <SectionTitle
            eyebrow="录入操作"
            title="维护人数与经费记录"
            description="先维护部门季度人数，再录入季度团建支出或创新专项申请。"
          />

          <form
            className="entry-form"
            onSubmit={(event) =>
              handleSubmit(
                event,
                '/api/quarter-configs',
                headcountForm,
                () => setHeadcountForm((current) => ({ ...current, headcount: '' })),
              )}
          >
            <h3>设置部门季度人数</h3>
            <select
              value={headcountForm.departmentId}
              onChange={(event) => setHeadcountForm((current) => ({ ...current, departmentId: event.target.value }))}
            >
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <input
              value={headcountForm.quarter}
              placeholder="2026-Q2"
              onChange={(event) => setHeadcountForm((current) => ({ ...current, quarter: event.target.value }))}
            />
            <input
              type="number"
              min="0"
              value={headcountForm.headcount}
              placeholder="部门人数"
              onChange={(event) => setHeadcountForm((current) => ({ ...current, headcount: event.target.value }))}
            />
            <button disabled={submitting}>保存人数</button>
          </form>

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
                    title: '',
                    amount: '',
                    spentDate: '',
                    note: '',
                  })),
              )}
          >
            <h3>新增季度团建支出</h3>
            <select
              value={quarterlyForm.departmentId}
              onChange={(event) => setQuarterlyForm((current) => ({ ...current, departmentId: event.target.value }))}
            >
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <input
              value={quarterlyForm.quarter}
              placeholder="2026-Q2"
              onChange={(event) => setQuarterlyForm((current) => ({ ...current, quarter: event.target.value }))}
            />
            <input
              value={quarterlyForm.title}
              placeholder="支出事项"
              onChange={(event) => setQuarterlyForm((current) => ({ ...current, title: event.target.value }))}
            />
            <input
              type="number"
              min="0"
              value={quarterlyForm.amount}
              placeholder="核销金额"
              onChange={(event) => setQuarterlyForm((current) => ({ ...current, amount: event.target.value }))}
            />
            <input
              type="date"
              value={quarterlyForm.spentDate}
              onChange={(event) => setQuarterlyForm((current) => ({ ...current, spentDate: event.target.value }))}
            />
            <textarea
              rows="2"
              value={quarterlyForm.note}
              placeholder="备注"
              onChange={(event) => setQuarterlyForm((current) => ({ ...current, note: event.target.value }))}
            />
            <button disabled={submitting}>录入支出</button>
          </form>

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
            <h3>新增创新专项</h3>
            <select
              value={innovationForm.departmentId}
              onChange={(event) => setInnovationForm((current) => ({ ...current, departmentId: event.target.value }))}
            >
              {departmentOptions.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <input
              value={innovationForm.quarter}
              placeholder="2026-Q2"
              onChange={(event) => setInnovationForm((current) => ({ ...current, quarter: event.target.value }))}
            />
            <input
              value={innovationForm.title}
              placeholder="专项名称"
              onChange={(event) => setInnovationForm((current) => ({ ...current, title: event.target.value }))}
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
            <select
              value={innovationForm.status}
              onChange={(event) => setInnovationForm((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="进行中">进行中</option>
              <option value="已完成">已完成</option>
            </select>
            <div className="inline-grid">
              <input
                type="date"
                value={innovationForm.applyDate}
                onChange={(event) => setInnovationForm((current) => ({ ...current, applyDate: event.target.value }))}
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
              rows="2"
              value={innovationForm.note}
              placeholder="备注"
              onChange={(event) => setInnovationForm((current) => ({ ...current, note: event.target.value }))}
            />
            <button disabled={submitting}>录入专项</button>
          </form>
        </div>
      </section>

      <section className="panel">
        <SectionTitle
          eyebrow="明细记录"
          title="按类型汇总查看"
          description="季度团建和创新专项分开标识，可按筛选条件统一查看。"
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
    </main>
  )
}

export default App
