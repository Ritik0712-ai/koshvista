import { useEffect, useState, useMemo } from "react";
import { Link, NavLink, useLocation, Navigate } from "react-router-dom";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  ChartNoAxesCombined,
  Landmark,
  Target,
  Upload,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Search,
  Menu,
  X,
  ShieldCheck,
  LogOut,
  Download,
  Trash2,
  Pencil,
  Sparkles,
  CalendarDays,
  Repeat,
  Coins,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { auth, request, download, openSourceOriginal } from "./lib/auth";
import { sample } from "./lib/sample";
import {
  EMPTY,
  CATEGORIES,
  type Workspace,
  type Resource,
  type Entry,
} from "../shared/types";
import {
  balance,
  d,
  formatMoney as fmt,
  today,
  income,
  spending,
  netWorth,
  monthSeries,
  categoryTotals,
  expandEntries,
  advanceDue,
  couponSchedule,
  holdings,
  fdValue,
  csv,
} from "../shared/finance";
import { schemas, transferSchema, validatedEntry } from "../shared/validation";
import { Editor, fields, type Field } from "./components/Editor";
import { Chart } from "./components/Chart";
import { ImportPage } from "./ImportPage";
import { BackupPage } from "./BackupPage";
import { AnalyticsPage } from "./AnalyticsPage";
import { SecuritySettings } from "./SecuritySettings";
import { useBackup } from "./lib/useBackup";
const navigation = [
  ["", "Overview", LayoutDashboard],
  ["transactions", "Transactions", ArrowLeftRight],
  ["accounts", "Accounts & cash", Wallet],
  ["budgets", "Budgets", Target],
  ["investments", "Investments", ChartNoAxesCombined],
  ["fixed-income", "FDs & bonds", Landmark],
  ["liabilities", "Liabilities", Coins],
  ["recurring", "Recurring", Repeat],
  ["analytics", "Analytics", ChartNoAxesCombined],
  ["imports", "Import centre", Upload],
  ["insights", "Insights", Sparkles],
  ["settings", "Settings & backup", Settings],
] as const;
export function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const result = await auth!.getSession();
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    enabled: !!auth,
    retry: false,
    staleTime: 0,
  });
  if (session.data?.user) return <Navigate to="/app" replace />;
  if (auth && session.isPending)
    return (
      <div className="loading" role="status">
        Completing secure sign-in…
      </div>
    );
  return (
    <div className="login">
      <div className="login-art">
        <Link className="brand" to="/">
          <img src="/icon.svg" alt="" />
          KoshVista<span>●</span>
        </Link>
        <p className="eyebrow">YOUR MONEY. THE COMPLETE PICTURE.</p>
        <h1>
          A little clarity.
          <br />A lot more control.
        </h1>
        <p>
          Every account, everyday expense, and future investment.
          <br />
          One considered place to understand your finances.
        </p>
        <div className="art-bars">
          {[26, 42, 37, 61, 52, 75, 68, 90].map((v, i) => (
            <div key={i} style={{ height: v + "%" }} />
          ))}
        </div>
        <small>
          Open source · No subscriptions · Built for your peace of mind
        </small>
      </div>
      <div className="login-form">
        <span className="pill">PERSONAL FINANCE, REIMAGINED</span>
        <h2>Welcome to KoshVista</h2>
        <p>Sign in to your private finance workspace.</p>
        <button
          disabled={busy || !auth}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await auth!.signIn.social({
                provider: "google",
                callbackURL: location.origin + "/app",
              });
              if (r.error) throw new Error(r.error.message);
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy ? "Connecting…" : "Continue with Google"}
          <ArrowUpRight size={18} />
        </button>
        {!auth && (
          <p className="notice">
            Sign-in configuration is pending. You can explore the sample
            workspace below.
          </p>
        )}
        {(error || session.error) && (
          <p role="alert" className="error">
            {error ||
              "Sign-in could not be completed. Please try Continue with Google again."}
          </p>
        )}
        <div className="divider">or take a look around</div>
        <Link className="button secondary" to="/demo">
          Explore sample workspace <ChevronRight size={18} />
        </Link>
        <p className="muted small">
          Sample data is clearly labelled and never mixed with your personal
          records.
        </p>
        <div className="privacy">
          <ShieldCheck size={22} />
          <span>
            Your records are private to your account.
            <br />
            Source code is open; your finances are not.
          </span>
        </div>
        <Link to="/privacy">How your data is handled</Link>
      </div>
    </div>
  );
}
export function App() {
  const location = useLocation(),
    demo = location.pathname.startsWith("/demo"),
    base = demo ? "/demo" : "/app",
    page = location.pathname.slice(base.length).replace(/^\//, "");
  const qc = useQueryClient();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const connect = () => {
      setOnline(true);
      void qc.invalidateQueries({ queryKey: ["workspace"] });
    };
    const disconnect = () => setOnline(false);
    window.addEventListener("online", connect);
    window.addEventListener("offline", disconnect);
    return () => {
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", disconnect);
    };
  }, [qc]);
  const [sampleState, setSample] = useState(sample),
    [mobile, setMobile] = useState(false),
    [notice, setNotice] = useState(""),
    [month, setMonth] = useState(today().slice(0, 7)),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState("all");
  const [editor, setEditor] = useState<{
      resource: Resource | "transfer";
      id?: string;
      initial?: Record<string, unknown>;
    } | null>(null),
    [custom, setCustom] = useState<{
      title: string;
      fields: Field[];
      save: (v: Record<string, string>) => Promise<void>;
    } | null>(null);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const r = await auth!.getSession();
      if (r.error) throw Error(r.error.message);
      return r.data;
    },
    enabled: !demo && !!auth,
    retry: false,
  });
  const state = useQuery({
    queryKey: ["workspace"],
    queryFn: () => request<Workspace>("/state"),
    enabled: !demo && !!session.data?.user,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const w = demo ? sampleState : (state.data ?? EMPTY);
  useEffect(() => {
    setMobile(false);
  }, [page]);
  useEffect(() => {
    document.documentElement.dataset.theme = w.profile.theme;
  }, [w.profile.theme]);
  const refresh = async () => {
    if (!demo) await qc.invalidateQueries({ queryKey: ["workspace"] });
  };
  const backupControls = useBackup(
    w,
    session.data?.user.id ?? "sample",
    demo,
    refresh,
    setNotice,
  );
  const mutate = async (path: string, method: string, body?: unknown) => {
    if (demo) throw Error("This operation needs your signed-in workspace.");
    const value = await request(path, method, body);
    await refresh();
    return value;
  };
  const save = async (
    resource: Resource | "transfer",
    values: Record<string, string>,
    id?: string,
  ) => {
    const b: Record<string, unknown> = { ...values };
    if (resource === "entries") {
      b.tags = [
        ...new Set(
          (values.tags_text ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      ];
      b.splits = (values.split_lines ?? "")
        .split("\n")
        .filter((s) => s.trim())
        .map((s) => {
          const [category, amount] = s.split("|");
          if (!category?.trim() || !amount?.trim())
            throw Error("Use Category | Amount on each split line.");
          return {
            category: category.trim(),
            amount: amount.trim().replace(/[₹,]/g, ""),
            note: "",
          };
        });
      b.amount =
        values.kind === "expense"
          ? d(values.amount).abs().neg().toString()
          : values.amount;
      b.currency = w.accounts.find((a) => a.id === values.account_id)?.currency;
      b.idempotency_key =
        editor?.initial?.idempotency_key ?? values.idempotency_key;
    }
    if (resource === "accounts")
      b.archived = values.account_state === "archived";
    if (resource === "fixed_income") {
      b.coupon_frequency = values.coupon_frequency || null;
      b.compounding = Number(values.compounding);
      b.status = editor?.initial?.status ?? "active";
    }
    if (resource === "recurring") b.active = values.reminder_state !== "paused";
    if (resource === "snapshots") b.cost_basis = values.cost_basis || null;
    if (resource === "trades") b.account_id = values.account_id || null;
    if (resource === "liabilities") b.due_on = values.due_on || null;
    if (resource === "transfer") b.idempotency_key = values.idempotency_key;
    const parsed =
      resource === "transfer"
        ? transferSchema.parse(b)
        : schemas[resource].parse(b);
    if (resource === "entries")
      validatedEntry(parsed as ReturnType<typeof schemas.entries.parse>);
    if (demo) {
      if (resource === "transfer") {
        const t = parsed as ReturnType<typeof transferSchema.parse>;
        const from = w.accounts.find((a) => a.id === t.from_id)!,
          to = w.accounts.find((a) => a.id === t.to_id)!;
        if (from.currency !== to.currency)
          throw Error("Choose accounts in the same currency.");
        const group = crypto.randomUUID();
        const rows = [from, to].map((a, i) => ({
          id: crypto.randomUUID(),
          account_id: a.id,
          occurred_on: t.occurred_on,
          amount: d(t.amount)
            .mul(i ? 1 : -1)
            .toString(),
          currency: a.currency,
          kind: "transfer" as const,
          category: "Transfer",
          merchant: i ? from.name : to.name,
          note: t.note,
          transfer_group_id: group,
          source_document_id: null,
          source_line_key: null,
          idempotency_key: crypto.randomUUID(),
        }));
        setSample((s) => ({ ...s, entries: [...s.entries, ...rows] }));
      } else {
        if (resource === "trades")
          throw Error(
            "Trade cash posting is available in the signed-in workspace.",
          );
        const row = {
          ...parsed,
          id: id ?? crypto.randomUUID(),
          ...(resource === "entries"
            ? {
                transfer_group_id: null,
                source_document_id: null,
                source_line_key: null,
              }
            : {}),
        };
        setSample((s) => ({
          ...s,
          [resource]: id
            ? s[resource].map((r) => (r.id === id ? row : r))
            : [...s[resource], row],
        }));
      }
    } else
      await mutate(
        resource === "transfer"
          ? "/transfers"
          : resource === "fixed_income" && !id
            ? "/fixed-income/open"
            : "/data/" + resource + (id ? "/" + id : ""),
        id ? "PATCH" : "POST",
        resource === "fixed_income" && !id
          ? { ...parsed, funding_account_id: values.funding_account_id || null }
          : parsed,
      );
    setNotice(
      demo
        ? "Sample updated. Changes reset on refresh."
        : "Saved to your private workspace.",
    );
  };
  const remove = async (resource: Resource, id: string) => {
    if (
      !confirm(
        "Delete this record? Linked transfer entries will be removed together.",
      )
    )
      return;
    try {
      if (demo)
        setSample((s) => ({
          ...s,
          [resource]: s[resource].filter((r) => r.id !== id),
        }));
      else await mutate("/data/" + resource + "/" + id, "DELETE");
      setNotice("Record deleted.");
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const edit = (resource: Resource, record: unknown) => {
    const r = record as Record<string, unknown>;
    setEditor({ resource, id: r.id as string, initial: r });
  };
  const actions = (resource: Resource, r: { id: string }) => (
    <div className="row-actions">
      <button
        aria-label="Edit record"
        className="icon-button"
        onClick={() => edit(resource, r)}
      >
        <Pencil size={15} />
      </button>
      <button
        aria-label="Delete record"
        className="icon-button"
        onClick={() => remove(resource, r.id)}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
  const currency = w.profile.currency,
    es = w.entries.filter(
      (e) => e.currency === currency && e.occurred_on.startsWith(month),
    ),
    inc = income(es),
    spent = spending(es),
    months = monthSeries(w.entries.filter((e) => e.currency === currency)),
    cats = categoryTotals(es);
  const bar = useMemo(
    () => ({
      color: ["#147e70", "#d7e8e4"],
      tooltip: { trigger: "axis" as const },
      legend: { bottom: 0, icon: "circle" },
      grid: { left: 58, right: 16, top: 22, bottom: 55 },
      xAxis: {
        type: "category" as const,
        data: months.map((m) => m.label),
        axisTick: { show: false },
        axisLine: { show: false },
      },
      yAxis: {
        type: "value" as const,
        axisLabel: {
          formatter: (v: number) => (v >= 1000 ? v / 1000 + "k" : String(v)),
        },
        splitLine: { lineStyle: { color: "#edf0ef", type: "dashed" as const } },
      },
      series: [
        {
          name: "Income",
          type: "bar" as const,
          data: months.map((m) => m.income),
          barMaxWidth: 22,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
        {
          name: "Expenses",
          type: "bar" as const,
          data: months.map((m) => m.expense),
          barMaxWidth: 22,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
        },
      ],
    }),
    [JSON.stringify(months)],
  );
  if (!demo && !auth) return <Navigate to="/" />;
  if (!demo && session.isPending)
    return <div className="loading">Opening your secure workspace…</div>;
  if (!demo && session.error)
    return (
      <div className="loading" role="alert">
        <h2>Sign-in needs another try</h2>
        <p>
          We could not confirm your session. Your saved records are unchanged.
        </p>
        <button onClick={() => session.refetch()}>Retry sign-in</button>
        <Link to="/">Back to sign-in</Link>
      </div>
    );
  if (!demo && !session.data?.user) return <Navigate to="/" />;
  if (!demo && state.isPending)
    return <div className="loading">Loading your financial records…</div>;
  if (!demo && state.error)
    return (
      <div className="loading">
        <h2>Your records could not be loaded</h2>
        <p>{state.error.message}</p>
        <button onClick={() => state.refetch()}>Retry connection</button>
      </div>
    );
  const ledger = (entries: Entry[], limit = 100) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Category</th>
            <th>Account</th>
            <th>Date</th>
            <th className="number">Amount</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries
            .slice()
            .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
            .slice(0, limit)
            .map((e) => (
              <tr key={e.id}>
                <td>
                  <div className="transaction-title">
                    <span
                      className={
                        "transaction-icon " +
                        (d(e.amount).gt(0) ? "positive" : "")
                      }
                    >
                      {d(e.amount).gt(0) ? (
                        <ArrowDownLeft size={17} />
                      ) : (
                        <ArrowUpRight size={17} />
                      )}
                    </span>
                    <div>
                      <Link to={base + "/activity/" + e.id}>
                        <strong>{e.merchant}</strong>
                      </Link>
                      <small>
                        {e.kind}
                        {e.source_document_id ? " · imported" : ""}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="tag">
                    {e.splits?.length
                      ? "Split across " + e.splits.length + " categories"
                      : e.category}
                  </span>
                  {!!e.splits?.length && (
                    <details>
                      <summary>View split</summary>
                      {e.splits.map((s, i) => (
                        <p key={i}>
                          {s.category}: {fmt(s.amount, e.currency)}
                        </p>
                      ))}
                    </details>
                  )}
                  {!!e.tags?.length && <small>{e.tags.join(" · ")}</small>}
                </td>
                <td>{w.accounts.find((a) => a.id === e.account_id)?.name}</td>
                <td>{e.occurred_on}</td>
                <td
                  className={"number " + (d(e.amount).gt(0) ? "positive" : "")}
                >
                  {fmt(e.amount, e.currency)}
                </td>
                <td>
                  {!["transfer", "investment"].includes(e.kind) &&
                    actions("entries", e)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {!entries.length && (
        <Empty text="No transactions here yet. Add an entry or import a statement." />
      )}
      {entries.length > limit && (
        <p className="muted">
          Showing {limit} of {entries.length}. Narrow your search or export all
          matching records.
        </p>
      )}
    </div>
  );
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <Link className="brand" to={base}>
          <img src="/icon.svg" alt="" />
          KoshVista<span>●</span>
        </Link>
        <button
          className="mobile-only icon-button close-nav"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav>
          {navigation.map(([path, label, Icon], i) => (
            <NavLink
              key={path}
              to={base + (path ? "/" + path : "")}
              end
              className={i === 9 ? "nav-divider" : ""}
            >
              <Icon size={19} />
              <span>{label}</span>
              {path === "imports" && <span className="nav-new">NEW</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={18} />
          <div>
            <strong>{demo ? "Sample workspace" : "Private by design"}</strong>
            <small>
              {demo ? "Illustrative data only" : "Your money, your data"}
            </small>
          </div>
        </div>
        <div className="profile">
          <span className="avatar">
            {(w.profile.display_name || "You").slice(0, 1)}
          </span>
          <div>
            <strong>{w.profile.display_name || "Your workspace"}</strong>
            <small>Personal account</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={async () => {
              if (!demo) {
                (await import("./lib/drive")).driveDisconnect();
                await auth?.signOut();
              }
              qc.clear();
              window.location.assign("/");
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-only icon-button"
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />{" "}
            <strong>
              {navigation.find((n) => n[0] === page)?.[1] ??
                (page.startsWith("activity/")
                  ? "Transaction details"
                  : "Overview")}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="sync-dot" />
            {demo ? "Sample data" : online ? "Cloud records loaded" : "Offline"}
            <span className="avatar small-avatar">
              {(w.profile.display_name || "Y")[0]}
            </span>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            You’re exploring sample data. Changes reset on refresh.{" "}
            <Link to="/">
              Sign in to save your finances <ArrowUpRight size={13} />
            </Link>
          </div>
        )}
        {!demo && !online && (
          <div className="demo-banner" role="status">
            You’re offline. Your loaded records remain visible. Reconnect to
            save changes; cloud records refresh when the connection returns.
          </div>
        )}
        <main id="main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page ? "YOUR FINANCIAL WORKSPACE" : "YOUR MONEY, AT A GLANCE"}
              </p>
              <h1>
                {page
                  ? (navigation.find((n) => n[0] === page)?.[1] ??
                    (page.startsWith("activity/")
                      ? "Transaction details"
                      : "Page not found"))
                  : "Your financial overview"}
                <span className="heading-dot">.</span>
              </h1>
              <p className="muted">
                {page
                  ? "Everything you need to understand and manage your money."
                  : "A clearer picture of where you are, and where you’re going."}
              </p>
            </div>
            <div className="heading-actions">
              <Link className="button secondary" to={base + "/imports"}>
                <Upload size={16} />
                Import
              </Link>
              <button
                onClick={() =>
                  setEditor({
                    resource: w.accounts.length ? "entries" : "accounts",
                  })
                }
              >
                <Plus size={17} />
                {w.accounts.length ? "Add transaction" : "Add account"}
              </button>
            </div>
          </div>
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button
                aria-label="Dismiss notification"
                className="icon-button"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!page && (
            <>
              <div className="overview-toolbar">
                <span className="pill">
                  <span className="sync-dot" />{" "}
                  {demo ? "ILLUSTRATIVE OVERVIEW" : "YOUR RECORDED FINANCES"}
                </span>
                <label className="month-filter">
                  <CalendarDays size={15} />
                  <input
                    aria-label="Overview month"
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                </label>
              </div>
              <section className="stats">
                <article className="stat featured">
                  <div className="stat-label">
                    Recorded net worth <Wallet size={19} />
                  </div>
                  <h2>{fmt(netWorth(w, currency), currency)}</h2>
                  <p>Accounts + holdings − debt</p>
                  <div className="stat-footer">
                    Dated valuations · {currency} only{" "}
                    <ArrowUpRight size={16} />
                  </div>
                </article>
                <Stat
                  label="Money in"
                  value={fmt(inc, currency)}
                  note="Income received this month"
                  icon={<ArrowDownLeft size={19} />}
                />
                <Stat
                  label="Money out"
                  value={fmt(spent, currency)}
                  note="Expenses, less refunds"
                  icon={<ArrowUpRight size={19} />}
                />
                <Stat
                  label="Left this month"
                  value={fmt(inc.minus(spent), currency)}
                  note={
                    inc.gt(0)
                      ? inc.minus(spent).div(inc).mul(100).toFixed(1) +
                        "% of income retained"
                      : "Add income to see your savings rate"
                  }
                  icon={<Target size={19} />}
                />
              </section>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="section-head">
                    <div>
                      <h2>Cash flow</h2>
                      <p className="muted">
                        The rhythm of your money, month by month
                      </p>
                    </div>
                    <span className="tag">Last 6 months</span>
                  </div>
                  <Chart
                    option={bar}
                    label="Six-month income and expense bar chart"
                  />
                  <details>
                    <summary>View chart data</summary>
                    <table>
                      <thead>
                        <tr>
                          <th>Month</th>
                          <th>Income</th>
                          <th>Expenses</th>
                        </tr>
                      </thead>
                      <tbody>
                        {months.map((m) => (
                          <tr key={m.key}>
                            <td>{m.label}</td>
                            <td>{fmt(m.income, currency)}</td>
                            <td>{fmt(m.expense, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </section>
                <section className="panel spending-panel">
                  <div className="section-head">
                    <div>
                      <h2>Where it went</h2>
                      <p className="muted">Spending by category</p>
                    </div>
                    <Link to={base + "/analytics"} aria-label="Open analytics">
                      <ArrowUpRight size={19} />
                    </Link>
                  </div>
                  {cats.length ? (
                    <>
                      <Chart
                        label="Expense category donut chart"
                        option={{
                          color: [
                            "#197e70",
                            "#64a99d",
                            "#98c5b7",
                            "#d2dfba",
                            "#dfc797",
                            "#b8c5cb",
                          ],
                          tooltip: { trigger: "item" },
                          series: [
                            {
                              type: "pie",
                              radius: ["64%", "83%"],
                              center: ["50%", "49%"],
                              label: { show: false },
                              data: cats,
                            },
                          ],
                          graphic: [
                            {
                              type: "text",
                              left: "center",
                              top: "42%",
                              style: {
                                text: fmt(spent, currency, true),
                                fontSize: 24,
                                fontWeight: 600,
                                fill: "#233a36",
                              },
                            },
                          ],
                        }}
                      />
                      <div className="category-legend">
                        {cats.slice(0, 4).map((c, i) => (
                          <div key={c.name}>
                            <span
                              style={{
                                background: [
                                  "#197e70",
                                  "#64a99d",
                                  "#98c5b7",
                                  "#d2dfba",
                                ][i],
                              }}
                            />
                            <span>{c.name}</span>
                            <strong>{fmt(c.value, currency)}</strong>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <Empty text="Add expenses to see your spending patterns." />
                  )}
                </section>
              </div>
              <div className="dashboard-grid lower">
                <section className="panel">
                  <div className="section-head">
                    <div>
                      <h2>Recent transactions</h2>
                      <p className="muted">
                        The little things add up. Keep them in sight.
                      </p>
                    </div>
                    <Link to={base + "/transactions"} className="text-link">
                      View all <ChevronRight size={15} />
                    </Link>
                  </div>
                  {ledger(w.entries, 5)}
                </section>
                <section className="panel">
                  <div className="section-head">
                    <h2>Your accounts</h2>
                    <Link to={base + "/accounts"} aria-label="View accounts">
                      <ArrowUpRight size={19} />
                    </Link>
                  </div>
                  {w.accounts.slice(0, 4).map((a) => (
                    <Link
                      to={base + "/accounts"}
                      className="account-line"
                      key={a.id}
                    >
                      <span className="account-icon">
                        {a.kind === "cash" ? (
                          <Wallet size={19} />
                        ) : (
                          <Landmark size={19} />
                        )}
                      </span>
                      <div>
                        <strong>{a.name}</strong>
                        <small>{a.kind.replaceAll("_", " ")}</small>
                      </div>
                      <strong>{fmt(balance(a, w.entries), a.currency)}</strong>
                    </Link>
                  ))}
                  {!w.accounts.length && (
                    <Empty text="Add a bank account or your cash wallet to begin." />
                  )}
                  <button
                    className="dashed-button"
                    onClick={() => setEditor({ resource: "accounts" })}
                  >
                    <Plus size={16} />
                    Add an account
                  </button>
                </section>
              </div>
            </>
          )}
          {page.startsWith("activity/") &&
            (() => {
              const entry = w.entries.find((e) => e.id === page.slice(9));
              if (!entry)
                return (
                  <section className="panel">
                    <h2>Transaction not found</h2>
                    <Link to={base + "/transactions"}>
                      Back to transactions
                    </Link>
                  </section>
                );
              const source = w.sources.find(
                (s) => s.id === entry.source_document_id,
              );
              const changes = w.audit.filter((a) => a.entity_id === entry.id);
              return (
                <section className="panel settings-panel">
                  <Link to={base + "/transactions"}>Back to transactions</Link>
                  <h2>{entry.merchant}</h2>
                  <p>
                    {fmt(entry.amount, entry.currency)} · {entry.occurred_on} ·{" "}
                    {entry.kind}
                  </p>
                  <p>
                    {w.accounts.find((a) => a.id === entry.account_id)?.name} ·{" "}
                    {entry.category}
                  </p>
                  {entry.note && <p>{entry.note}</p>}
                  {!!entry.tags?.length && <p>Tags: {entry.tags.join(", ")}</p>}
                  {!!entry.splits?.length && (
                    <ul>
                      {entry.splits.map((s, i) => (
                        <li key={i}>
                          {s.category}: {fmt(s.amount, entry.currency)} {s.note}
                        </li>
                      ))}
                    </ul>
                  )}
                  <h3>Source evidence</h3>
                  {source ? (
                    <>
                      <p>
                        {source.name} · saved{" "}
                        {source.created_at
                          ? new Date(source.created_at).toLocaleString()
                          : "date unavailable"}
                      </p>
                      {source.extracted_text && (
                        <details>
                          <summary>Read saved extracted text</summary>
                          <pre
                            style={{
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                            }}
                          >
                            {source.extracted_text}
                          </pre>
                        </details>
                      )}
                      {source.storage_key && (
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              await openSourceOriginal(source);
                            } catch (e) {
                              setNotice((e as Error).message);
                            }
                          }}
                        >
                          {source.mime_type === "application/zip"
                            ? "Download saved screenshots"
                            : "Open saved original"}
                        </button>
                      )}
                      <Link to={base + "/imports"}>View document library</Link>
                    </>
                  ) : (
                    <p className="muted">
                      This transaction has no attached source document.
                    </p>
                  )}
                  <h3>Saved activity</h3>
                  {changes.length ? (
                    changes.map((a) => (
                      <details key={a.id}>
                        <summary>
                          {a.action.replaceAll("_", " ")} ·{" "}
                          {new Date(a.occurred_at).toLocaleString()}
                        </summary>
                        {a.before_data && a.after_data && (
                          <table>
                            <thead>
                              <tr>
                                <th>Field</th>
                                <th>Before</th>
                                <th>After</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.keys(a.after_data)
                                .filter(
                                  (k) =>
                                    ![
                                      "id",
                                      "owner_id",
                                      "idempotency_key",
                                      "created_at",
                                      "updated_at",
                                    ].includes(k) &&
                                    JSON.stringify(a.before_data?.[k]) !==
                                      JSON.stringify(a.after_data?.[k]),
                                )
                                .map((k) => (
                                  <tr key={k}>
                                    <td>{k.replaceAll("_", " ")}</td>
                                    <td>
                                      {JSON.stringify(
                                        a.before_data?.[k] ?? "—",
                                      )}
                                    </td>
                                    <td>
                                      {JSON.stringify(a.after_data?.[k] ?? "—")}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        )}
                      </details>
                    ))
                  ) : (
                    <p className="muted">
                      No retained activity for this transaction.
                    </p>
                  )}
                </section>
              );
            })()}
          {page &&
            !page.startsWith("activity/") &&
            !navigation.some((n) => n[0] === page) && (
              <section className="panel">
                <p>This page does not exist.</p>
                <Link to={base}>Back to overview</Link>
              </section>
            )}
          {page === "transactions" && (
            <section className="panel">
              <div className="filters">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    placeholder="Search merchant, category or note"
                    aria-label="Search transactions"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <input
                  aria-label="Transaction month"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
                <select
                  aria-label="Transaction type"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="all">All types</option>
                  {[
                    "expense",
                    "income",
                    "refund",
                    "transfer",
                    "investment",
                    "adjustment",
                  ].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <button
                  className="secondary"
                  onClick={() => setEditor({ resource: "transfer" })}
                >
                  Transfer
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    download(
                      csv(
                        w.entries
                          .filter((e) => e.occurred_on.startsWith(month))
                          .map((e) => ({ ...e })),
                      ) as string,
                      "koshvista-transactions.csv",
                      "text/csv",
                    )
                  }
                >
                  <Download size={16} />
                  Export month
                </button>
              </div>
              {ledger(
                w.entries.filter(
                  (e) =>
                    e.occurred_on.startsWith(month) &&
                    (kind === "all" || e.kind === kind) &&
                    (
                      e.merchant +
                      " " +
                      e.category +
                      " " +
                      e.note +
                      " " +
                      (e.tags ?? []).join(" ") +
                      " " +
                      (e.splits ?? []).map((s) => s.category).join(" ")
                    )
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                ),
              )}
            </section>
          )}
          {page === "accounts" && (
            <>
              <div className="section-head">
                <p className="muted">
                  Cash is an account too. Moving money between your accounts is
                  a transfer.
                </p>
                <button onClick={() => setEditor({ resource: "transfer" })}>
                  <ArrowLeftRight size={16} />
                  Transfer money
                </button>
              </div>
              <div className="card-grid">
                {w.accounts.map((a) => (
                  <article className="panel account-card" key={a.id}>
                    <div className="section-head">
                      <span className="account-icon">
                        {a.kind === "cash" ? <Wallet /> : <Landmark />}
                      </span>
                      <span className="tag">
                        {a.archived ? "Archived" : a.kind.replaceAll("_", " ")}
                      </span>
                    </div>
                    <h2>{a.name}</h2>
                    <p className="muted">
                      {a.institution || "Personal account"}
                    </p>
                    <h3>{fmt(balance(a, w.entries), a.currency)}</h3>
                    <small>
                      Opening {fmt(a.opening_balance, a.currency)} ·{" "}
                      {a.opening_date}
                    </small>
                    <div className="section-head">
                      {actions("accounts", a)}
                      <button
                        className="text-button"
                        onClick={() =>
                          setCustom({
                            title: "Reconcile " + a.name,
                            fields: [
                              {
                                key: "actual",
                                label: "Balance shown on your statement",
                                type: "number",
                              },
                              {
                                key: "on",
                                label: "As of date",
                                type: "date",
                                value: today(),
                              },
                            ],
                            save: async (v) => {
                              setNotice(
                                "Difference on " +
                                  v.on +
                                  ": " +
                                  fmt(
                                    d(v.actual).minus(
                                      balance(a, w.entries, v.on),
                                    ),
                                    a.currency,
                                  ) +
                                  ". Review missing entries or add an explicit adjustment.",
                              );
                            },
                          })
                        }
                      >
                        Reconcile
                      </button>
                    </div>
                  </article>
                ))}
                <button
                  className="add-card"
                  onClick={() => setEditor({ resource: "accounts" })}
                >
                  <Plus size={26} />
                  <strong>Add account or cash wallet</strong>
                  <span>Bring your balances together</span>
                </button>
              </div>
            </>
          )}
          {page === "budgets" && (
            <>
              <div className="section-head">
                <input
                  aria-label="Budget month"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
                <button onClick={() => setEditor({ resource: "budgets" })}>
                  <Plus size={16} />
                  Set a budget
                </button>
              </div>
              <div className="card-grid">
                {w.budgets
                  .filter((b) => b.period === month)
                  .map((b) => {
                    const used = spending(
                        expandEntries(w.entries).filter(
                          (e) =>
                            e.currency === b.currency &&
                            e.category === b.category &&
                            e.occurred_on.startsWith(b.period),
                        ),
                      ),
                      pct = Math.max(0, used.div(b.amount).mul(100).toNumber());
                    return (
                      <article className="panel" key={b.id}>
                        <div className="section-head">
                          <h2>{b.category}</h2>
                          {actions("budgets", b)}
                        </div>
                        <h3>
                          {fmt(used, b.currency)}{" "}
                          <small>of {fmt(b.amount, b.currency)}</small>
                        </h3>
                        <progress
                          className={pct > 100 ? "over" : ""}
                          max={100}
                          value={pct}
                        />
                        <p className={pct > 100 ? "negative" : "muted"}>
                          {pct > 100
                            ? "Over budget by " +
                              fmt(used.minus(b.amount), b.currency)
                            : fmt(d(b.amount).minus(used), b.currency) +
                              " remaining"}
                        </p>
                      </article>
                    );
                  })}
              </div>
              {!w.budgets.some((b) => b.period === month) && (
                <Empty text="Give your spending a plan. Set a category budget for this month." />
              )}
            </>
          )}
          {page === "investments" && (
            <>
              <div className="section-head">
                <p className="muted">
                  Valuations are dated snapshots. Unknown costs stay unknown.
                </p>
                <div className="heading-actions">
                  <button
                    className="secondary"
                    onClick={() => setEditor({ resource: "instruments" })}
                  >
                    Add investment
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setEditor({ resource: "trades" })}
                  >
                    Record trade
                  </button>
                  <button onClick={() => setEditor({ resource: "snapshots" })}>
                    Add valuation
                  </button>
                </div>
              </div>
              <section className="panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Investment</th>
                        <th>Units</th>
                        <th>Cost basis</th>
                        <th>Market value</th>
                        <th>Unrealised gain</th>
                        <th>As of</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holdings(w).map((h) => (
                        <tr key={h.instrument.id}>
                          <td>
                            <strong>{h.instrument.name}</strong>
                            <small>
                              {h.instrument.asset_class} · {h.source}
                            </small>
                          </td>
                          <td>{h.quantity.toString()}</td>
                          <td>
                            {h.cost === null
                              ? "Unknown"
                              : fmt(h.cost, h.instrument.currency)}
                          </td>
                          <td>
                            {h.value === null
                              ? "Needs valuation"
                              : fmt(h.value, h.instrument.currency)}
                          </td>
                          <td>
                            {h.value !== null && h.cost !== null
                              ? fmt(
                                  h.value.minus(h.cost),
                                  h.instrument.currency,
                                )
                              : "Not available"}
                          </td>
                          <td>{h.asOf ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!w.instruments.length && (
                  <Empty text="Add an investment, then record a trade or a statement valuation." />
                )}
              </section>
              <section className="panel spaced">
                <h2>Trade history</h2>
                {w.trades.map((t) => (
                  <div className="account-line" key={t.id}>
                    <div>
                      <strong>
                        {
                          w.instruments.find((i) => i.id === t.instrument_id)
                            ?.name
                        }{" "}
                        · {t.kind}
                      </strong>
                      <small>
                        {t.traded_on} · {t.quantity} units at {t.unit_price} ·
                        Fees {t.fees}
                      </small>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => remove("trades", t.id)}
                    >
                      Reverse trade
                    </button>
                  </div>
                ))}
                <h2 className="spaced">Valuation history</h2>
                {w.snapshots.map((s) => (
                  <div className="account-line" key={s.id}>
                    <div>
                      <strong>
                        {
                          w.instruments.find((i) => i.id === s.instrument_id)
                            ?.name
                        }
                      </strong>
                      <small>
                        {s.as_of} · {s.source}
                      </small>
                    </div>
                    <strong>{s.market_value}</strong>
                    {actions("snapshots", s)}
                  </div>
                ))}
              </section>
            </>
          )}
          {page === "fixed-income" && (
            <>
              <div className="section-head">
                <p className="muted">
                  Projected maturity values are estimates. Actual payouts are
                  recorded separately.
                </p>
                <button onClick={() => setEditor({ resource: "fixed_income" })}>
                  Add FD or bond
                </button>
              </div>
              <div className="card-grid">
                {w.fixed_income.map((f) => (
                  <article className="panel" key={f.id}>
                    <div className="section-head">
                      <span className="tag">
                        {f.kind.toUpperCase()} · {f.status}
                      </span>
                      {actions("fixed_income", f)}
                    </div>
                    <h2>{f.name}</h2>
                    <p className="muted">
                      {f.issuer} · {f.annual_rate}% p.a.
                    </p>
                    <h3>{fmt(f.principal, f.currency)}</h3>
                    <p>
                      Estimated maturity{" "}
                      <strong>{fmt(fdValue(f), f.currency)}</strong>
                    </p>
                    <small>
                      {f.start_on} → {f.maturity_on}
                    </small>
                    {f.payout === "periodic" && (
                      <>
                        <h4>Upcoming interest dates</h4>
                        {couponSchedule(f).map((c) => (
                          <p key={c.date}>
                            {c.date} · estimated {fmt(c.estimate, f.currency)}
                          </p>
                        ))}
                        {!f.coupon_frequency && (
                          <p className="muted small">
                            Add the documented payment frequency to see a
                            schedule.
                          </p>
                        )}
                        <p className="muted small">
                          Simple periodic estimates from principal and annual
                          rate. Tax, day count and issuer terms may change the
                          actual payment.
                        </p>
                        {f.status !== "closed" && (
                          <button
                            className="secondary full spaced"
                            onClick={() =>
                              setCustom({
                                title: "Record received interest / coupon",
                                fields: [
                                  {
                                    key: "account_id",
                                    label: "Receiving account",
                                    options: w.accounts
                                      .filter(
                                        (a) =>
                                          !a.archived &&
                                          a.currency === f.currency,
                                      )
                                      .map((a) => ({
                                        value: a.id,
                                        label: a.name,
                                      })),
                                  },
                                  {
                                    key: "amount",
                                    label: "Actual interest received",
                                    type: "number",
                                  },
                                  {
                                    key: "occurred_on",
                                    label: "Received on",
                                    type: "date",
                                    value: today(),
                                  },
                                ],
                                save: async (v) => {
                                  await mutate(
                                    "/fixed-income/" + f.id + "/interest",
                                    "POST",
                                    v,
                                  );
                                  setNotice(
                                    "Actual interest recorded. Principal stays invested.",
                                  );
                                },
                              })
                            }
                          >
                            Record received interest
                          </button>
                        )}
                      </>
                    )}
                    {f.status !== "closed" && (
                      <button
                        className="secondary full spaced"
                        onClick={() =>
                          setCustom({
                            title: "Record actual payout",
                            fields: [
                              {
                                key: "account_id",
                                label: "Receiving account",
                                options: w.accounts
                                  .filter((a) => a.currency === f.currency)
                                  .map((a) => ({ value: a.id, label: a.name })),
                              },
                              {
                                key: "amount",
                                label: "Actual amount received",
                                type: "number",
                              },
                              {
                                key: "occurred_on",
                                label: "Payout date",
                                type: "date",
                                value: today(),
                              },
                            ],
                            save: async (v) => {
                              await mutate(
                                "/fixed-income/" + f.id + "/settle",
                                "POST",
                                v,
                              );
                              setNotice("Payout recorded and holding closed.");
                            },
                          })
                        }
                      >
                        Record payout & close
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {!w.fixed_income.length && (
                <Empty text="Add your fixed deposits or bonds with their documented terms." />
              )}
            </>
          )}
          {page === "liabilities" && (
            <>
              <div className="section-head">
                <p className="muted">
                  Create a credit or liability account with a negative opening
                  balance first.
                </p>
                <button onClick={() => setEditor({ resource: "liabilities" })}>
                  Add debt details
                </button>
              </div>
              <div className="card-grid">
                {w.liabilities.map((l) => {
                  const a = w.accounts.find((a) => a.id === l.account_id)!;
                  return (
                    <article className="panel" key={l.id}>
                      <div className="section-head">
                        <h2>{l.creditor}</h2>
                        {actions("liabilities", l)}
                      </div>
                      <h3>{fmt(balance(a, w.entries).neg(), a.currency)}</h3>
                      <p>
                        {l.annual_rate}% p.a. · Due {l.due_on ?? "not set"}
                      </p>
                      <p className="muted">{l.note}</p>
                      <button
                        className="secondary"
                        onClick={() =>
                          setEditor({
                            resource: "transfer",
                            initial: { to_id: a.id },
                          })
                        }
                      >
                        Record repayment
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {page === "recurring" && (
            <>
              <div className="section-head">
                <p className="muted">
                  Upcoming reminders. Nothing is posted to your ledger
                  automatically.
                </p>
                <button onClick={() => setEditor({ resource: "recurring" })}>
                  Add recurring bill
                </button>
              </div>
              <section className="panel">
                {w.recurring.map((r) => (
                  <div className="account-line" key={r.id}>
                    <Repeat size={20} />
                    <div>
                      <strong>{r.merchant}</strong>
                      <small>
                        {r.frequency} · Next due {r.next_due_on} ·{" "}
                        {r.active
                          ? r.next_due_on <= today()
                            ? "Due now"
                            : "Active"
                          : "Paused"}
                      </small>
                    </div>
                    <strong>{fmt(r.amount, r.currency)}</strong>
                    {actions("recurring", r)}
                    <button
                      className="secondary"
                      disabled={!r.active}
                      onClick={() =>
                        setCustom({
                          title: "Record payment for " + r.merchant,
                          fields: [
                            {
                              key: "account_id",
                              label: "Paying account",
                              options: w.accounts
                                .filter(
                                  (a) =>
                                    !a.archived && a.currency === r.currency,
                                )
                                .map((a) => ({ value: a.id, label: a.name })),
                            },
                            {
                              key: "occurred_on",
                              label: "Actual payment date",
                              type: "date",
                              value: today(),
                            },
                          ],
                          save: async (v) => {
                            if (demo) {
                              const entry: Entry = {
                                id: crypto.randomUUID(),
                                account_id: v.account_id,
                                occurred_on: v.occurred_on,
                                amount: d(r.amount).neg().toString(),
                                currency: r.currency,
                                kind: "expense",
                                category: r.category,
                                merchant: r.merchant,
                                note: "Recurring payment",
                                idempotency_key: crypto.randomUUID(),
                                source_document_id: null,
                                source_line_key: null,
                                transfer_group_id: null,
                              };
                              setSample((s) => ({
                                ...s,
                                entries: [...s.entries, entry],
                                recurring: s.recurring.map((x) =>
                                  x.id === r.id
                                    ? {
                                        ...x,
                                        next_due_on: advanceDue(
                                          r.next_due_on,
                                          r.frequency,
                                          r.anchor_day ?? undefined,
                                        ),
                                      }
                                    : x,
                                ),
                              }));
                            } else
                              await mutate(
                                "/recurring/" + r.id + "/payment",
                                "POST",
                                { ...v, due_on: r.next_due_on },
                              );
                            setNotice(
                              "Payment saved. The reminder moved to its next due date.",
                            );
                          },
                        })
                      }
                    >
                      Record payment
                    </button>
                    <button
                      className="secondary"
                      onClick={async () => {
                        try {
                          if (demo)
                            setSample((s) => ({
                              ...s,
                              recurring: s.recurring.map((x) =>
                                x.id === r.id ? { ...x, active: !x.active } : x,
                              ),
                            }));
                          else
                            await mutate(
                              "/data/recurring/" + r.id,
                              "PATCH",
                              schemas.recurring.parse({
                                ...r,
                                active: !r.active,
                              }),
                            );
                          setNotice(
                            r.active ? "Reminder paused." : "Reminder resumed.",
                          );
                        } catch (e) {
                          setNotice((e as Error).message);
                        }
                      }}
                    >
                      {r.active ? "Pause" : "Resume"}
                    </button>
                  </div>
                ))}
                {!w.recurring.length && (
                  <Empty text="Keep rent, subscriptions and regular bills in view." />
                )}
              </section>
            </>
          )}
          {page === "analytics" && <AnalyticsPage w={w} />}
          {page === "imports" && (
            <ImportPage
              w={w}
              demo={demo}
              refresh={refresh}
              notify={setNotice}
              onAdd={(r) => setEditor({ resource: r })}
            />
          )}
          {page === "insights" && (
            <div className="card-grid">
              <article className="panel insight">
                <Sparkles />
                <h2>Your spending focus</h2>
                <p>
                  {cats.length
                    ? cats[0].name +
                      " is your largest expense category this month at " +
                      fmt(cats[0].value, currency) +
                      "."
                    : "Import a statement to reveal your spending patterns."}
                </p>
                <small>
                  Calculated from your {month} ledger. No external AI service.
                </small>
              </article>
              <article className="panel">
                <Target />
                <h2>Budget watch</h2>
                {w.budgets
                  .filter((b) => b.period === month)
                  .map((b) => (
                    <p key={b.id}>
                      {b.category}:{" "}
                      {fmt(
                        d(b.amount).minus(
                          spending(
                            expandEntries(es).filter(
                              (e) => e.category === b.category,
                            ),
                          ),
                        ),
                        b.currency,
                      )}{" "}
                      remaining
                    </p>
                  ))}
                {!w.budgets.length && (
                  <p>Set category budgets to receive a spending check.</p>
                )}
              </article>
              <article className="panel">
                <ShieldCheck />
                <h2>Data confidence</h2>
                <p>
                  {w.entries.length} recorded transactions · {w.sources.length}{" "}
                  source documents.
                </p>
                <p>
                  {holdings(w).filter((h) => h.cost === null).length}{" "}
                  investments have unknown cost basis.
                </p>
                <small>
                  Insights describe your records; they do not predict markets.
                </small>
              </article>
            </div>
          )}
          {page === "settings" && (
            <>
              <section className="panel settings-panel">
                <h2>Workspace preferences</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const v = Object.fromEntries(new FormData(e.currentTarget));
                    try {
                      if (demo)
                        setSample((s) => ({
                          ...s,
                          profile: { ...s.profile, ...v },
                        }));
                      else await mutate("/profile", "PATCH", v);
                      setNotice("Preferences saved.");
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                >
                  <div className="form-grid">
                    <label>
                      Display name
                      <input
                        name="display_name"
                        defaultValue={w.profile.display_name}
                      />
                    </label>
                    <label>
                      Reporting currency
                      <select name="currency" defaultValue={currency}>
                        {["INR", "USD", "EUR", "GBP"].map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Appearance
                      <select name="theme" defaultValue={w.profile.theme}>
                        <option value="system">System</option>
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </label>
                  </div>
                  <p className="muted">
                    Different currencies are reported separately. No assumed
                    exchange rates.
                  </p>
                  <button>Save preferences</button>
                </form>
              </section>
              <BackupPage
                controls={backupControls}
                w={w}
                owner={session.data?.user.id ?? "sample"}
                demo={demo}
                refresh={refresh}
                notify={setNotice}
              />
              <SecuritySettings
                demo={demo}
                currentSession={session.data?.session.id}
              />
              <section className="panel spaced">
                <h2>Activity history</h2>
                {w.audit.slice(0, 20).map((a) => (
                  <div className="account-line" key={a.id}>
                    <strong>
                      {a.action} · {a.entity_type}
                    </strong>
                    <small>{new Date(a.occurred_at).toLocaleString()}</small>
                    {a.before_data && a.after_data && (
                      <details>
                        <summary>View changes</summary>
                        <table>
                          <thead>
                            <tr>
                              <th>Field</th>
                              <th>Before</th>
                              <th>After</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys(a.after_data)
                              .filter(
                                (k) =>
                                  ![
                                    "id",
                                    "created_at",
                                    "idempotency_key",
                                    "updated_at",
                                  ].includes(k) &&
                                  JSON.stringify(a.before_data?.[k]) !==
                                    JSON.stringify(a.after_data?.[k]),
                              )
                              .map((k) => (
                                <tr key={k}>
                                  <td>{k.replaceAll("_", " ")}</td>
                                  <td>
                                    {typeof a.before_data?.[k] === "object"
                                      ? JSON.stringify(a.before_data[k])
                                      : String(a.before_data?.[k] ?? "—")}
                                  </td>
                                  <td>
                                    {typeof a.after_data?.[k] === "object"
                                      ? JSON.stringify(a.after_data[k])
                                      : String(a.after_data?.[k] ?? "—")}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </details>
                    )}
                  </div>
                ))}
                {!w.audit.length && (
                  <p className="muted">Your saved changes will appear here.</p>
                )}
              </section>
            </>
          )}
          <footer>
            KoshVista <span>Clarity for today. Confidence for tomorrow.</span>
            <Link to="/privacy">Privacy & data</Link>
            <a
              href="https://github.com/Ritik0712-ai/koshvista"
              target="_blank"
              rel="noreferrer"
            >
              Open source <ArrowUpRight size={12} />
            </a>
          </footer>
        </main>
      </div>
      {editor && (
        <Editor
          title={
            (editor.id ? "Edit " : "Add ") +
            {
              entries: "transaction",
              accounts: "account",
              fixed_income: "FD or bond",
              snapshots: "valuation",
              instruments: "investment",
              trades: "trade",
              budgets: "budget",
              liabilities: "debt details",
              recurring: "recurring bill",
              transfer: "transfer",
            }[editor.resource]
          }
          fields={fields(editor.resource, w)}
          initial={editor.initial}
          onClose={() => setEditor(null)}
          onSave={(v) => save(editor.resource, v, editor.id)}
        />
      )}{" "}
      {custom && (
        <Editor
          title={custom.title}
          fields={custom.fields}
          onClose={() => setCustom(null)}
          onSave={custom.save}
        />
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="stat">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <h2>{value}</h2>
      <p>{note}</p>
      <div className="stat-footer">This month</div>
    </article>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Wallet size={28} />
      <p>{text}</p>
    </div>
  );
}
