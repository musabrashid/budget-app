"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Wallet,
  Settings,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ShieldCheck,
  ArrowDown,
  ArrowUp,
  LogOut,
  AlertCircle,
  Download,
  X,
  Menu,
} from "lucide-react";
import type { AppData, Screen, Transaction } from "@/types";
import type { Mutation } from "@/lib/mutations";
import {
  calculateMonthlyBudget,
  calculateMonthProjection,
  calculateCategorySpend,
  categorizeTransaction,
  includedInBudget,
  monthInZone,
  recommendBudgets,
  shiftMonth,
} from "@/lib/budget/logic";
import { mutateDemo } from "@/lib/demo-mutations";
import { createDemo } from "@/lib/demo";
import { CategoryIcon } from "./icons";
import { Dialog } from "./dialog";
import {
  CategoryEditor,
  BudgetEditor,
  TransactionEditor,
  RuleEditor,
} from "./editors";
import { ConnectBank, requestJson } from "./connect-bank";
import { signOut } from "@/app/login/actions";
const nav = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard, path: "/" },
  {
    id: "transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    path: "/transactions",
  },
  { id: "budgets", label: "Budgets", icon: Wallet, path: "/budgets" },
  {
    id: "trends",
    label: "Insights",
    icon: ChartNoAxesCombined,
    path: "/trends",
  },
  { id: "accounts", label: "Accounts", icon: ShieldCheck, path: "/accounts" },
  { id: "settings", label: "Settings", icon: Settings, path: "/settings" },
] as const;
const money = (v: number, currency = "USD", digits = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
const compactMonth = (month: string) => monthLabel(month).split(" ")[0];
const statusClass = (status: string) =>
  status === "Over budget"
    ? "over"
    : status === "Near limit"
      ? "near"
      : status === "Watch"
        ? "watch"
        : "track";
type Modal =
  | { kind: "category"; id: string }
  | { kind: "edit-category"; id?: string }
  | { kind: "budget"; id: string }
  | { kind: "transaction"; id: string }
  | { kind: "rule"; id?: string; transactionId?: string }
  | { kind: "delete"; id: string };
const subscribeDemo = (callback: () => void) => {
  window.addEventListener("still-demo-change", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("still-demo-change", callback);
    window.removeEventListener("storage", callback);
  };
};
const demoSnapshot = () => {
  try {
    return localStorage.getItem("still-demo-v1");
  } catch {
    return null;
  }
};
export function BudgetApp({
  initialData,
  screen,
  initialMonth,
}: {
  initialData: AppData;
  screen: Screen;
  initialMonth?: string;
}) {
  const [liveData, setData] = useState(initialData);
  const storedDemo = useSyncExternalStore(
    subscribeDemo,
    demoSnapshot,
    () => null,
  );
  const persistedDemo = useMemo(() => {
    try {
      const parsed = storedDemo ? JSON.parse(storedDemo) : null;
      return parsed?.demo &&
        Array.isArray(parsed.categories) &&
        parsed.preferences?.timezone
        ? (parsed as AppData)
        : null;
    } catch {
      return null;
    }
  }, [storedDemo]);
  const data = initialData.demo ? (persistedDemo ?? liveData) : liveData;
  const [month, setMonth] = useState(() => {
    const current = monthInZone(
      new Date(initialData.loadedAt),
      initialData.preferences.timezone,
    ).month;
    if (initialMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(initialMonth))
      return initialMonth;
    return initialData.preferences.default_month === "last"
      ? shiftMonth(current, -1)
      : current;
  });
  const [modal, setModal] = useState<Modal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState("");
  const [pendingFilter, setPendingFilter] = useState("all");
  const [inclusionFilter, setInclusionFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState("order");
  useEffect(() => {
    const theme = data.preferences.theme;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [data.preferences.theme]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  async function reload() {
    const response = await fetch("/api/data", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setData(result);
  }
  async function save(input: Mutation) {
    if (busy) return false;
    setBusy(true);
    try {
      if (data.demo) {
        const next = mutateDemo(data, input);
        localStorage.setItem("still-demo-v1", JSON.stringify(next));
        window.dispatchEvent(new Event("still-demo-change"));
      } else {
        const next = await requestJson("/api/data", input);
        setData(next);
      }
      setNotice("Saved. Your budget is up to date.");
      return true;
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Could not save your changes.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (data.demo) {
      setNotice(
        "You’re exploring sample data. Connect a bank in your private workspace to synchronize transactions.",
      );
      return;
    }
    setBusy(true);
    try {
      const result = await requestJson("/api/plaid/sync", {});
      await reload();
      setNotice(
        result.failed
          ? `Updated ${result.synced} bank connections. ${result.failed} need attention; check Accounts and try again.`
          : result.busy
            ? "A bank sync is already running or was requested recently. Please try again shortly."
            : result.synced
              ? "Latest available transactions synchronized."
              : "Connect your first bank to start syncing.",
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not refresh.");
    } finally {
      setBusy(false);
    }
  }
  const summary = useMemo(
    () => data.monthlySummaries?.[month] ?? calculateMonthlyBudget(data, month),
    [data, month],
  );
  const previous =
    data.monthlySummaries?.[shiftMonth(month, -1)] ??
    calculateMonthlyBudget(data, shiftMonth(month, -1));
  const projection = calculateMonthProjection(
    summary.spent,
    month,
    new Date(data.loadedAt),
    data.preferences.timezone,
  );
  const categories = [...summary.categories].sort((a, b) =>
    sort === "usage"
      ? (b.percentage ?? -1) - (a.percentage ?? -1)
      : sort === "spend"
        ? b.spent - a.spent
        : a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );
  const attention = categories
    .filter((c) => (c.percentage ?? 0) >= 90)
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0));
  const transactions = data.transactions
    .filter(
      (t) =>
        !t.removed &&
        t.transaction_date.startsWith(month) &&
        (!search ||
          `${t.merchant_name} ${t.original_name}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (!categoryFilter ||
          categorizeTransaction(t, data.rules, data.categories) ===
            categoryFilter) &&
        (!accountFilter || t.account_id === accountFilter) &&
        (!institutionFilter || t.institution_id === institutionFilter) &&
        (pendingFilter === "all" ||
          t.pending === (pendingFilter === "pending")) &&
        (inclusionFilter === "all" ||
          includedInBudget(
            t,
            data.accounts,
            data.preferences.include_pending,
            data.rules,
          ) ===
            (inclusionFilter === "included")),
    )
    .sort(
      (a, b) =>
        b.transaction_date.localeCompare(a.transaction_date) ||
        a.id.localeCompare(b.id),
    );
  const hasForeignCurrency = data.transactions.some(
    (t) => t.currency !== "USD" && !t.removed,
  );
  const lastSync = data.institutions
    .map((i) => i.last_synced_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);
  const link = (path: string) =>
    `${data.demo ? `/demo${path === "/" ? "" : path}` : path}?month=${month}`;
  function openTransaction(t: Transaction) {
    setModal({ kind: "transaction", id: t.id });
  }
  function txRows(rows: Transaction[]) {
    return rows.length ? (
      <div className="transaction-list">
        {rows.map((t) => {
          const category = data.categories.find(
            (c) =>
              c.id === categorizeTransaction(t, data.rules, data.categories),
          );
          const account = data.accounts.find((a) => a.id === t.account_id);
          const included = includedInBudget(
            t,
            data.accounts,
            data.preferences.include_pending,
            data.rules,
          );
          return (
            <button
              key={t.id}
              className="transaction-row"
              onClick={() => openTransaction(t)}
            >
              <span
                className={`category-icon ${t.transaction_type === "refund" ? "mint" : ""}`}
              >
                <CategoryIcon name={category?.icon ?? "dots"} />
              </span>
              <span className="transaction-copy">
                <strong>{t.merchant_name ?? t.original_name}</strong>
                <span>
                  {category?.name ?? "Other"} · {account?.name}
                </span>
                <span className="mobile-date">
                  {t.transaction_date}
                  {t.pending ? " · Pending" : ""}
                </span>
              </span>
              <span className="transaction-date">
                {new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${t.transaction_date}T12:00:00Z`))}
                <small>
                  {t.pending
                    ? "Pending"
                    : !included
                      ? "Excluded"
                      : t.amount < 0
                        ? "Refund"
                        : "Posted"}
                </small>
              </span>
              <strong
                className={`transaction-amount ${t.amount < 0 ? "positive" : ""}`}
              >
                {t.amount < 0 ? "−" : ""}
                {money(Math.abs(t.amount), t.currency, 2)}
                <small className="mobile-treatment">
                  {!included ? "Excluded" : t.pending ? "Pending" : ""}
                </small>
              </strong>
              <ChevronRight className="row-chevron" size={16} />
            </button>
          );
        })}
      </div>
    ) : (
      <Empty
        title="No transactions here yet"
        text={
          search
            ? "Try a different search or filter."
            : "Transactions will appear when your bank finishes preparing its history."
        }
      />
    );
  }
  function categoryCard(c: (typeof categories)[number]) {
    return (
      <button
        className="budget-card"
        key={c.id}
        onClick={() => setModal({ kind: "category", id: c.id })}
      >
        <span className="budget-card-top">
          <span className="category-icon">
            <CategoryIcon name={c.icon} />
          </span>
          <span className={`status ${statusClass(c.status)}`}>
            <span />
            {c.status}
          </span>
        </span>
        <span className="budget-card-name">
          {c.name}
          {!c.active && <small>Archived</small>}
        </span>
        <span className="budget-card-money">
          <strong>{money(c.spent)}</strong>
          <span> / {money(c.budget)}</span>
        </span>
        <Progress percentage={c.percentage} status={c.status} />
        <span className="budget-card-bottom">
          <span>
            {c.percentage === null
              ? "Set a budget"
              : `${Math.round(c.percentage)}% used`}
          </span>
          <strong className={c.remaining < 0 ? "negative" : ""}>
            {money(Math.abs(c.remaining))} {c.remaining < 0 ? "over" : "left"}
          </strong>
        </span>
      </button>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href={link("/")}>
          <span className="brand-symbol">
            <Wallet size={22} />
          </span>
          still<span className="brand-dot">.</span>
        </Link>
        <div className="sidebar-label">YOUR WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <Link
              key={n.id}
              className={screen === n.id ? "nav-link active" : "nav-link"}
              href={link(n.path)}
            >
              <n.icon size={19} />
              {n.label}
              {screen === n.id && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="private-card">
            <ShieldCheck size={21} />
            <strong>Just for you.</strong>
            <p>Your money stays your business.</p>
          </div>
          <div className="profile">
            <span className="avatar">
              {data.demo ? "D" : (data.email?.slice(0, 1).toUpperCase() ?? "M")}
            </span>
            <span>
              <strong>
                {data.demo ? "Demo workspace" : "Personal workspace"}
              </strong>
              <small>{data.demo ? "Sample data only" : data.email}</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <Link href={link("/")} className="brand">
              <span className="brand-symbol">
                <Wallet size={18} />
              </span>
              still.
            </Link>
          </div>
          <span className="breadcrumb">
            Your money <ChevronRight size={14} />
            <strong>{nav.find((n) => n.id === screen)?.label}</strong>
          </span>
          <div className="topbar-right">
            <span className="private-label">
              <span className="green-dot" />
              {data.demo ? "Demo workspace" : "Private workspace"}
            </span>
            <Link
              aria-label="Settings"
              className="icon-button"
              href={link("/settings")}
            >
              <Settings size={18} />
            </Link>
            <span className="avatar small-avatar">
              {data.demo ? "D" : data.email?.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="main-content" aria-busy={busy}>
          {data.demo && (
            <div className="demo-banner">
              <span>
                <span className="demo-pill">DEMO</span> A preview with sample
                data. Try it out — changes save on this device.
              </span>
              <Link href="/login">
                Your private workspace <ArrowUpRight size={15} />
              </Link>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <AlertCircle size={18} />
              <span>{notice}</span>
              <button
                aria-label="Dismiss message"
                className="icon-button"
                onClick={() => setNotice(null)}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {hasForeignCurrency && (
            <div className="notice" role="alert">
              Non-USD transactions are shown in their original currency and
              excluded from USD budgets. Currency conversion is not configured.
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {screen === "dashboard"
                  ? "A LITTLE CLARITY, EVERY DAY"
                  : screen === "transactions"
                    ? "THE LITTLE THINGS ADD UP"
                    : screen === "budgets"
                      ? "MAKE A PLAN THAT FITS"
                      : screen === "accounts"
                        ? "EVERYTHING, IN ONE PLACE"
                        : screen === "trends"
                          ? "SEE THE BIGGER PICTURE"
                          : "YOUR SPACE, YOUR WAY"}
              </p>
              <h1>
                {screen === "dashboard"
                  ? "Your month, at a glance."
                  : screen === "transactions"
                    ? "Transactions"
                    : screen === "budgets"
                      ? "Your budgets"
                      : screen === "accounts"
                        ? "Connected accounts"
                        : screen === "trends"
                          ? "Spending insights"
                          : "Settings"}
              </h1>
              <p className="page-description">
                {screen === "dashboard"
                  ? "Know where you stand. Make room for what matters."
                  : screen === "transactions"
                    ? "The story behind your spending."
                    : screen === "budgets"
                      ? "A little intention goes a long way."
                      : screen === "accounts"
                        ? "Secure connections. A clearer picture."
                        : screen === "trends"
                          ? "A little perspective on your money habits."
                          : "Keep your budget feeling like you."}
              </p>
            </div>
            {!["accounts", "settings"].includes(screen) && (
              <div className="month-selector">
                <button
                  aria-label="Previous month"
                  onClick={() => setMonth(shiftMonth(month, -1))}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>{monthLabel(month)}</span>
                <button
                  aria-label="Next month"
                  onClick={() => setMonth(shiftMonth(month, 1))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
          {(screen === "dashboard" || screen === "budgets") && (
            <>
              <section className="overview-grid">
                <article className="spending-summary">
                  <div className="summary-left">
                    <div className="eyebrow">
                      <span className="green-dot" />
                      {compactMonth(month).toUpperCase()} SPENDING
                    </div>
                    <div className="big-money">
                      {money(Math.trunc(summary.spent))}
                      <span>
                        .
                        {String(
                          Math.round((Math.abs(summary.spent) % 1) * 100),
                        ).padStart(2, "0")}
                      </span>
                    </div>
                    <p>of {money(summary.budget)} monthly budget</p>
                    <div className="summary-bottom">
                      <span className="remaining-chip">
                        <ArrowUpRight size={16} />
                        {money(Math.abs(summary.remaining))}{" "}
                        {summary.remaining < 0 ? "over budget" : "remaining"}
                      </span>
                      <span className="summary-footnote">
                        {summary.percentage === null
                          ? "Set limits to get started"
                          : summary.remaining >= 0
                            ? "A little breathing room."
                            : "Time to take a closer look."}
                      </span>
                    </div>
                  </div>
                  <div className="budget-ring">
                    <svg viewBox="0 0 140 140" aria-hidden="true">
                      <circle cx="70" cy="70" r="58" className="ring-track" />
                      <circle
                        cx="70"
                        cy="70"
                        r="58"
                        className="ring-fill"
                        style={{
                          strokeDasharray: `${Math.min(100, Math.max(0, summary.percentage ?? 0)) * 3.644} 364.4`,
                        }}
                      />
                    </svg>
                    <div>
                      <strong>
                        {Math.round(summary.percentage ?? 0)}
                        <small>%</small>
                      </strong>
                      <span>
                        {summary.percentage === null
                          ? "no limits set"
                          : "budget used"}
                      </span>
                    </div>
                  </div>
                </article>
                <article className="projection-card">
                  <div className="card-label">
                    <ChartNoAxesCombined size={18} />
                    THE MONTH AHEAD
                  </div>
                  <p>Estimated month-end spending</p>
                  <strong>
                    {projection === null ? "—" : money(projection)}
                  </strong>
                  <div className="projection-rule" />
                  <span className="projection-status">
                    {projection === null
                      ? "Estimates appear once the month starts."
                      : projection > summary.budget
                        ? `${money(projection - summary.budget)} above your budget`
                        : `${money(summary.budget - projection)} below your budget`}
                  </span>
                  <p className="small muted">
                    Estimate: spending ÷ elapsed days × days in month. Your pace
                    may change.
                  </p>
                </article>
              </section>
              {!data.demo && !data.preferences.onboarding_complete && (
                <section className="onboarding card">
                  <div>
                    <span className="eyebrow">LET’S GET YOU SETTLED</span>
                    <h2>Your budget starts here.</h2>
                    <p>
                      Connect accounts → sync transactions → review categories →
                      set your monthly limits.
                    </p>
                  </div>
                  <div className="onboarding-actions">
                    {data.institutions.length === 0 ? (
                      <ConnectBank
                        demo={data.demo}
                        ready={data.plaidReady}
                        onConnected={reload}
                        onError={setNotice}
                      />
                    ) : (
                      <Link
                        href={link("/budgets")}
                        className="button secondary"
                      >
                        Review budgets
                      </Link>
                    )}
                    <button
                      className="button secondary"
                      onClick={() =>
                        save({
                          op: "preferences",
                          ...data.preferences,
                          onboarding_complete: true,
                        })
                      }
                    >
                      Finish setup
                    </button>
                  </div>
                </section>
              )}
              {screen === "dashboard" && attention.length > 0 && (
                <section className="attention-section">
                  <div className="section-heading">
                    <h2>
                      <span className="attention-dot" />
                      Needs a little attention{" "}
                      <span className="count">{attention.length}</span>
                    </h2>
                    <span className="muted small">A gentle heads-up</span>
                  </div>
                  <div className="attention-grid">
                    {attention.map((c) => (
                      <button
                        key={c.id}
                        className={`attention-card ${statusClass(c.status)}`}
                        onClick={() => setModal({ kind: "category", id: c.id })}
                      >
                        <span className="category-icon">
                          <CategoryIcon name={c.icon} />
                        </span>
                        <span>
                          <strong>{c.name}</strong>
                          <small>
                            {money(c.spent)} of {money(c.budget)}
                          </small>
                        </span>
                        <span className="attention-value">
                          <strong>{Math.round(c.percentage ?? 0)}%</strong>
                          <small>{c.status}</small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <section className="budget-section">
                <div className="section-heading">
                  <h2>
                    {screen === "dashboard"
                      ? "Your budget"
                      : "Category budgets"}
                    <span className="count">
                      {
                        categories.filter((c) => c.active || c.spent !== 0)
                          .length
                      }
                    </span>
                  </h2>
                  <div className="section-controls">
                    <label className="sr-only" htmlFor="sort">
                      Sort categories
                    </label>
                    <select
                      id="sort"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="order">Custom order</option>
                      <option value="usage">Most used</option>
                      <option value="spend">Largest spend</option>
                    </select>
                    <button
                      className="button secondary compact"
                      onClick={() => setModal({ kind: "edit-category" })}
                    >
                      <Plus size={16} />
                      New category
                    </button>
                  </div>
                </div>
                <div className="budget-grid">
                  {categories
                    .filter((c) => c.active || c.spent !== 0)
                    .map(categoryCard)}
                </div>
              </section>
              {screen === "budgets" && (
                <section className="card recommendations">
                  <div className="section-heading">
                    <h2>A helpful starting point</h2>
                  </div>
                  <p className="muted">
                    Optional suggestions use the average spending of up to three
                    completed months, rounded up to $25. They are never applied
                    automatically.
                  </p>
                  {recommendBudgets(
                    data,
                    monthInZone(
                      new Date(data.loadedAt),
                      data.preferences.timezone,
                    ).month,
                  ).length ? (
                    recommendBudgets(
                      data,
                      monthInZone(
                        new Date(data.loadedAt),
                        data.preferences.timezone,
                      ).month,
                    )
                      .filter((r) => r.suggested > 0)
                      .map((r) => (
                        <div className="settings-row" key={r.category_id}>
                          <span>
                            <strong>{r.name}</strong>
                            <small>{r.months} completed months</small>
                          </span>
                          <button
                            className="button secondary"
                            onClick={() => {
                              const c = data.categories.find(
                                (c) => c.id === r.category_id,
                              )!;
                              save({
                                op: "category",
                                id: c.id,
                                name: c.name,
                                icon: c.icon as Extract<
                                  Mutation,
                                  { op: "category" }
                                >["icon"],
                                monthly_budget: r.suggested,
                                parent_category_id: c.parent_category_id,
                              });
                            }}
                          >
                            Use {money(r.suggested)}/month
                          </button>
                        </div>
                      ))
                  ) : (
                    <Empty
                      title="A few months will tell the story"
                      text="Suggestions become available after at least two completed months of transactions."
                    />
                  )}
                </section>
              )}
            </>
          )}
          {screen === "dashboard" && (
            <section className="recent-section">
              <div className="section-heading">
                <h2>Recent transactions</h2>
                <Link className="text-link" href={link("/transactions")}>
                  View all <ArrowUpRight size={15} />
                </Link>
              </div>
              <div className="card">{txRows(transactions.slice(0, 5))}</div>
            </section>
          )}
          {screen === "transactions" && (
            <section>
              <div className="transaction-toolbar">
                <label className="search-field">
                  <Search size={19} />
                  <span className="sr-only">
                    Search merchant or description
                  </span>
                  <input
                    type="search"
                    placeholder="Search merchant or description…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <button
                  className={`button secondary ${showFilters ? "selected" : ""}`}
                  onClick={() => setShowFilters(!showFilters)}
                  aria-expanded={showFilters}
                >
                  <SlidersHorizontal size={17} />
                  Filters
                </button>
              </div>
              {showFilters && (
                <div className="filter-panel card">
                  <label>
                    Category
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                      <option value="">All categories</option>
                      {data.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Account
                    <select
                      value={accountFilter}
                      onChange={(e) => setAccountFilter(e.target.value)}
                    >
                      <option value="">All accounts</option>
                      {data.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Institution
                    <select
                      value={institutionFilter}
                      onChange={(e) => setInstitutionFilter(e.target.value)}
                    >
                      <option value="">All institutions</option>
                      {data.institutions.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Status
                    <select
                      value={pendingFilter}
                      onChange={(e) => setPendingFilter(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="posted">Posted</option>
                    </select>
                  </label>
                  <label>
                    Budget inclusion
                    <select
                      value={inclusionFilter}
                      onChange={(e) => setInclusionFilter(e.target.value)}
                    >
                      <option value="all">All transactions</option>
                      <option value="included">Included</option>
                      <option value="excluded">Excluded</option>
                    </select>
                  </label>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setCategoryFilter("");
                      setAccountFilter("");
                      setInstitutionFilter("");
                      setPendingFilter("all");
                      setInclusionFilter("all");
                      setSearch("");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
              <div className="section-heading">
                <h2>{transactions.length} transactions</h2>
                <span className="muted small">
                  Tap a transaction to make it yours
                </span>
              </div>
              <div className="card">{txRows(transactions)}</div>
            </section>
          )}
          {screen === "accounts" && (
            <>
              <div className="section-heading">
                <h2>Your connections</h2>
                <ConnectBank
                  demo={data.demo}
                  ready={data.plaidReady}
                  onConnected={reload}
                  onError={setNotice}
                />
              </div>
              {!data.institutions.length ? (
                <Empty
                  title="A clearer picture starts with a connection"
                  text="Connect your first account to start tracking your budget."
                />
              ) : (
                data.institutions.map((institution) => (
                  <section
                    className="card institution-card"
                    key={institution.id}
                  >
                    <div className="institution-heading">
                      <span className="institution-logo">
                        <Wallet size={24} />
                      </span>
                      <div>
                        <h2>{institution.name}</h2>
                        <p className="small muted">
                          {data.demo
                            ? "Sample bank · no real connection"
                            : institution.last_synced_at
                              ? `Last synced ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.preferences.timezone }).format(new Date(institution.last_synced_at))}`
                              : "Initial history is preparing. Refresh shortly."}
                        </p>
                      </div>
                      <span className="status track">
                        {institution.status.replaceAll("_", " ")}
                      </span>
                    </div>
                    {institution.status === "reconnect_required" && (
                      <ConnectBank
                        demo={data.demo}
                        ready={data.plaidReady}
                        institutionId={institution.id}
                        onConnected={reload}
                        onError={setNotice}
                      />
                    )}
                    <div className="accounts-list">
                      {data.accounts
                        .filter((a) => a.institution_id === institution.id)
                        .map((a) => (
                          <div key={a.id} className="account-row">
                            <span className="category-icon">
                              <Wallet size={19} />
                            </span>
                            <div className="account-copy">
                              <strong>
                                {a.name}{" "}
                                <span className="muted">
                                  •••• {a.mask ?? "—"}
                                </span>
                              </strong>
                              <p>{a.subtype ?? a.type}</p>
                              <span className="small muted">
                                {a.current_balance !== null
                                  ? `${a.type === "credit" ? "Current owed" : "Current balance"}: ${money(a.current_balance, a.currency, 2)}`
                                  : "Balance unavailable"}
                              </span>
                            </div>
                            <label className="toggle-label">
                              <span>
                                {a.include_in_budget ? "Included" : "Excluded"}
                              </span>
                              <input
                                type="checkbox"
                                role="switch"
                                aria-label={`Include ${a.name} in budget`}
                                checked={a.include_in_budget}
                                onChange={(e) =>
                                  save({
                                    op: "account",
                                    id: a.id,
                                    include_in_budget: e.target.checked,
                                  })
                                }
                              />
                            </label>
                          </div>
                        ))}
                    </div>
                  </section>
                ))
              )}
              <div className="privacy-note">
                <ShieldCheck size={17} />
                Bank credentials are handled by Plaid. Still only receives
                account and transaction data.
              </div>
              <p className="small muted">
                Savings and investment accounts are excluded by default.
                Transfers and credit card payments do not add to spending. Bank
                data is the latest available, not a live balance.
              </p>
            </>
          )}
          {screen === "trends" && (
            <>
              <div className="trend-summary-grid">
                <article className="card trend-stat">
                  <p className="eyebrow">{compactMonth(month).toUpperCase()}</p>
                  <strong>{money(summary.spent)}</strong>
                  <span>This month’s spending</span>
                </article>
                <article className="card trend-stat">
                  <p className="eyebrow">
                    {compactMonth(shiftMonth(month, -1)).toUpperCase()}
                  </p>
                  <strong>{money(previous.spent)}</strong>
                  <span>Previous month’s spending</span>
                </article>
                <article className="card trend-stat">
                  <p className="eyebrow">MONTH OVER MONTH</p>
                  <strong
                    className={
                      summary.spent > previous.spent ? "negative" : "positive"
                    }
                  >
                    {summary.spent >= previous.spent ? "+" : "−"}
                    {money(Math.abs(summary.spent - previous.spent))}
                  </strong>
                  <span>
                    {previous.spent !== 0
                      ? `${(((summary.spent - previous.spent) / Math.abs(previous.spent)) * 100).toFixed(1)}% change`
                      : "No previous-month baseline"}
                  </span>
                </article>
              </div>
              <section className="card trend-chart">
                <div className="section-heading">
                  <h2>Spending, over time</h2>
                  <span className="muted small">Last 6 months</span>
                </div>
                <div
                  className="bar-chart"
                  role="img"
                  aria-label="Monthly spending chart. Exact amounts are labeled on each bar."
                >
                  {Array.from({ length: 6 }, (_, i) =>
                    shiftMonth(month, i - 5),
                  ).map((m) => {
                    const spend = calculateMonthlyBudget(data, m).spent;
                    const max = Math.max(
                      1,
                      ...Array.from(
                        { length: 6 },
                        (_, i) =>
                          calculateMonthlyBudget(data, shiftMonth(month, i - 5))
                            .spent,
                      ),
                    );
                    return (
                      <div className="chart-column" key={m}>
                        <strong>{money(spend)}</strong>
                        <div
                          className={`chart-bar ${m === month ? "current" : ""}`}
                          style={{
                            height: `${Math.max(2, (spend / max) * 150)}px`,
                          }}
                        />
                        <span>{compactMonth(m).slice(0, 3)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="card category-comparisons">
                <div className="section-heading">
                  <h2>Where things shifted</h2>
                  <span className="muted small">This month vs. last month</span>
                </div>
                {categories
                  .filter(
                    (c) =>
                      c.spent !== 0 ||
                      calculateCategorySpend(
                        data,
                        c.id,
                        shiftMonth(month, -1),
                      ) !== 0,
                  )
                  .map((c) => {
                    const prev = calculateCategorySpend(
                      data,
                      c.id,
                      shiftMonth(month, -1),
                    );
                    const diff = c.spent - prev;
                    return (
                      <button
                        className="comparison-row"
                        key={c.id}
                        onClick={() => setModal({ kind: "category", id: c.id })}
                      >
                        <span className="category-icon">
                          <CategoryIcon name={c.icon} />
                        </span>
                        <strong>{c.name}</strong>
                        <span>
                          <small>Last month</small>
                          {money(prev)}
                        </span>
                        <span>
                          <small>This month</small>
                          {money(c.spent)}
                        </span>
                        <span className={diff > 0 ? "negative" : "positive"}>
                          {diff > 0 ? (
                            <ArrowUp size={14} />
                          ) : (
                            <ArrowDown size={14} />
                          )}{" "}
                          {prev !== 0
                            ? `${Math.abs((diff / prev) * 100).toFixed(0)}%`
                            : money(Math.abs(diff))}
                        </span>
                      </button>
                    );
                  })}
              </section>
            </>
          )}
          {screen === "settings" && (
            <div className="settings-grid">
              <section className="card settings-card">
                <h2>Make it yours</h2>
                <div className="settings-row">
                  <span>
                    <strong>Include pending transactions</strong>
                    <small>
                      Get a fuller picture before transactions post.
                    </small>
                  </span>
                  <input
                    aria-label="Include pending transactions"
                    type="checkbox"
                    role="switch"
                    checked={data.preferences.include_pending}
                    onChange={(e) =>
                      save({
                        op: "preferences",
                        ...data.preferences,
                        include_pending: e.target.checked,
                      })
                    }
                  />
                </div>
                <label className="settings-row">
                  <span>
                    <strong>Appearance</strong>
                    <small>A calmer view, day or night.</small>
                  </span>
                  <select
                    value={data.preferences.theme}
                    onChange={(e) =>
                      save({
                        op: "preferences",
                        ...data.preferences,
                        theme: e.target.value as "light" | "dark" | "system",
                      })
                    }
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </select>
                </label>
                <label className="settings-row">
                  <span>
                    <strong>Open to</strong>
                    <small>Your default budget month.</small>
                  </span>
                  <select
                    value={data.preferences.default_month}
                    onChange={(e) =>
                      save({
                        op: "preferences",
                        ...data.preferences,
                        default_month: e.target.value as "current" | "last",
                      })
                    }
                  >
                    <option value="current">Current month</option>
                    <option value="last">Previous month</option>
                  </select>
                </label>
                <label className="settings-row">
                  <span>
                    <strong>Time zone</strong>
                    <small>Used for month boundaries and sync times.</small>
                  </span>
                  <select
                    value={data.preferences.timezone}
                    onChange={(e) =>
                      save({
                        op: "preferences",
                        ...data.preferences,
                        timezone: e.target.value,
                      })
                    }
                  >
                    {[
                      "America/Chicago",
                      "America/New_York",
                      "America/Denver",
                      "America/Los_Angeles",
                      "Etc/UTC",
                    ].map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <div className="settings-row">
                  <span>
                    <strong>Bank connections</strong>
                    <small>Manage accounts and budgeting inclusion.</small>
                  </span>
                  <Link
                    className="icon-button"
                    aria-label="Manage bank connections"
                    href={link("/accounts")}
                  >
                    <ArrowUpRight size={19} />
                  </Link>
                </div>
                <div className="settings-row">
                  <span>
                    <strong>Spending insights</strong>
                    <small>See monthly trends and category comparisons.</small>
                  </span>
                  <Link
                    className="icon-button"
                    aria-label="View spending insights"
                    href={link("/trends")}
                  >
                    <ArrowUpRight size={19} />
                  </Link>
                </div>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={refresh}
                >
                  <RefreshCw size={17} />
                  Refresh transactions
                </button>
              </section>
              <section className="card settings-card">
                <h2>At home on your iPhone</h2>
                <div className="install-illustration">
                  <Wallet size={28} />
                  <span>still.</span>
                </div>
                <p>
                  Open this app in Safari, tap the Share button, then choose{" "}
                  <strong>Add to Home Screen</strong>. Open Still from its icon
                  for the full app experience.
                </p>
                <p className="small muted">
                  Your budget needs an internet connection. The offline screen
                  helps you reconnect; financial pages and credentials are never
                  cached by the service worker.
                </p>
                <div className="privacy-note">
                  <ShieldCheck size={16} />
                  No advertising. No analytics trackers.
                </div>
              </section>
              <section className="card settings-card full-width">
                <div className="section-heading">
                  <h2>Categories</h2>
                  <button
                    className="button secondary"
                    onClick={() => setModal({ kind: "edit-category" })}
                  >
                    <Plus size={17} />
                    New category
                  </button>
                </div>
                {[...data.categories]
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((c, i, list) => (
                    <div key={c.id} className="category-management-row">
                      <span className="category-icon">
                        <CategoryIcon name={c.icon} />
                      </span>
                      <span className="category-management-copy">
                        <strong>{c.name}</strong>
                        <small>
                          {c.is_default ? "Built-in" : "Custom"} ·{" "}
                          {money(c.monthly_budget)}/month
                          {!c.active ? " · Archived" : ""}
                        </small>
                      </span>
                      <div className="category-actions">
                        <button
                          className="icon-button"
                          disabled={i === 0 || busy}
                          aria-label={`Move ${c.name} up`}
                          onClick={() => {
                            const ids = list.map((c) => c.id);
                            [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                            save({ op: "reorder", ids });
                          }}
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          className="button text compact"
                          onClick={() =>
                            setModal({ kind: "edit-category", id: c.id })
                          }
                        >
                          Edit
                        </button>
                        <button
                          className="button text compact"
                          onClick={() =>
                            save({ op: "archive", id: c.id, active: !c.active })
                          }
                        >
                          {c.active ? "Archive" : "Restore"}
                        </button>
                        {!c.is_default && (
                          <button
                            className="button text compact negative"
                            onClick={() =>
                              setModal({ kind: "delete", id: c.id })
                            }
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </section>
              <section className="card settings-card full-width">
                <div className="section-heading">
                  <h2>
                    Categorization rules{" "}
                    <span className="count">{data.rules.length}</span>
                  </h2>
                  <button
                    className="button secondary"
                    onClick={() => setModal({ kind: "rule" })}
                  >
                    <Plus size={17} />
                    New rule
                  </button>
                </div>
                {data.rules.length ? (
                  [...data.rules]
                    .sort((a, b) => a.priority - b.priority)
                    .map((r) => (
                      <div className="settings-row rule-row" key={r.id}>
                        <span>
                          <strong>
                            {r.match_value} →{" "}
                            {
                              data.categories.find(
                                (c) => c.id === r.category_id,
                              )?.name
                            }
                          </strong>
                          <small>
                            {r.rule_type.replaceAll("_", " ")} · Priority{" "}
                            {r.priority}
                            {r.exclude_from_budget
                              ? " · Excludes spending"
                              : ""}
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          role="switch"
                          aria-label={`Enable rule ${r.match_value}`}
                          checked={r.active}
                          onChange={(e) =>
                            save({ op: "rule", ...r, active: e.target.checked })
                          }
                        />
                        <button
                          className="button text"
                          onClick={() => setModal({ kind: "rule", id: r.id })}
                        >
                          Edit
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete rule ${r.match_value}`}
                          onClick={() => save({ op: "delete_rule", id: r.id })}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))
                ) : (
                  <Empty
                    title="A few rules, less busywork"
                    text="Tell Still where your favorite merchants belong. Manual category choices always take priority."
                  />
                )}
              </section>
              <section className="card settings-card full-width">
                <h2>Your data, your control</h2>
                <p className="muted">
                  Still uses Vercel for hosting, Supabase for sign-in and
                  storage, and Plaid for bank connections. No other service
                  receives your financial data.
                </p>
                <div className="data-actions">
                  <button
                    className="button secondary"
                    onClick={() => {
                      const quote = (v: unknown) =>
                        `"${String(v ?? "")
                          .replaceAll('"', '""')
                          .replace(/^[=+\-@\t\r]/, "'$&")}"`;
                      const rows = [
                        [
                          "Date",
                          "Merchant",
                          "Amount",
                          "Currency",
                          "Category",
                          "Account",
                          "Pending",
                          "Included",
                          "Notes",
                        ],
                        ...data.transactions
                          .filter((t) => !t.removed)
                          .map((t) => [
                            t.transaction_date,
                            t.merchant_name ?? t.original_name,
                            t.amount,
                            t.currency,
                            data.categories.find(
                              (c) =>
                                c.id ===
                                categorizeTransaction(
                                  t,
                                  data.rules,
                                  data.categories,
                                ),
                            )?.name,
                            data.accounts.find((a) => a.id === t.account_id)
                              ?.name,
                            t.pending,
                            includedInBudget(
                              t,
                              data.accounts,
                              data.preferences.include_pending,
                              data.rules,
                            ),
                            t.notes,
                          ]),
                      ];
                      const url = URL.createObjectURL(
                        new Blob(
                          [
                            rows
                              .map((row) => row.map(quote).join(","))
                              .join("\n"),
                          ],
                          { type: "text/csv" },
                        ),
                      );
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "still-transactions.csv";
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download size={17} />
                    Export transactions
                  </button>
                  {data.demo ? (
                    <button
                      className="button secondary"
                      onClick={() => {
                        const next = createDemo();
                        localStorage.removeItem("still-demo-v1");
                        window.dispatchEvent(new Event("still-demo-change"));
                        setData(next);
                        setNotice("Demo reset to the original sample data.");
                      }}
                    >
                      Reset demo
                    </button>
                  ) : (
                    <form action={signOut}>
                      <button className="button secondary">
                        <LogOut size={17} />
                        Sign out
                      </button>
                    </form>
                  )}
                </div>
                <p className="small muted">
                  Still v1 · Budget rollover, recurring expense detection,
                  savings goals, and shared budgets are planned extensions.
                </p>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <ShieldCheck size={14} /> Your money stays your business.
            </span>
            <button className="sync-button" disabled={busy} onClick={refresh}>
              <RefreshCw size={13} className={busy ? "spinning" : ""} />
              {busy
                ? "Synchronizing…"
                : data.demo
                  ? "Sample data"
                  : lastSync
                    ? `Last synced ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: data.preferences.timezone }).format(new Date(lastSync))}`
                    : "Not synced yet"}
            </button>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Main navigation">
        {nav
          .filter((n) => n.id !== "trends" && n.id !== "settings")
          .map((n) => (
            <Link
              key={n.id}
              href={link(n.path)}
              className={screen === n.id ? "active" : ""}
            >
              <n.icon size={21} />
              <span>{n.label === "Overview" ? "Home" : n.label}</span>
            </Link>
          ))}
        <Link
          href={link("/settings")}
          className={
            screen === "settings" || screen === "trends" ? "active" : ""
          }
        >
          <Menu size={21} />
          <span>More</span>
        </Link>
      </nav>
      {modal && (
        <Dialog
          title={
            modal.kind === "category"
              ? (data.categories.find((c) => c.id === modal.id)?.name ??
                "Category")
              : modal.kind === "edit-category"
                ? modal.id
                  ? "Edit category"
                  : "New category"
                : modal.kind === "budget"
                  ? "Set a budget"
                  : modal.kind === "transaction"
                    ? "Transaction details"
                    : modal.kind === "delete"
                      ? "Delete custom category"
                      : modal.id
                        ? "Edit rule"
                        : "New rule"
          }
          onClose={() => setModal(null)}
        >
          <fieldset className="editor-fieldset" disabled={busy}>
            {modal.kind === "edit-category" && (
              <CategoryEditor
                data={data}
                category={data.categories.find((c) => c.id === modal.id)}
                save={save}
                close={() => setModal(null)}
              />
            )}
            {modal.kind === "budget" && (
              <BudgetEditor
                category={data.categories.find((c) => c.id === modal.id)!}
                month={month}
                budget={categories.find((c) => c.id === modal.id)!.budget}
                save={save}
                close={() => setModal(null)}
              />
            )}
            {modal.kind === "transaction" && (
              <TransactionEditor
                data={data}
                t={data.transactions.find((t) => t.id === modal.id)!}
                save={save}
                close={() => setModal(null)}
                makeRule={(t) =>
                  setModal({ kind: "rule", transactionId: t.id })
                }
              />
            )}
            {modal.kind === "rule" && (
              <RuleEditor
                data={data}
                rule={data.rules.find((r) => r.id === modal.id)}
                transaction={data.transactions.find(
                  (t) => t.id === modal.transactionId,
                )}
                save={save}
                close={() => setModal(null)}
              />
            )}
            {modal.kind === "delete" && (
              <form
                className="form-stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await save({
                      op: "delete_category",
                      id: modal.id,
                      target: String(
                        new FormData(e.currentTarget).get("target"),
                      ),
                    })
                  )
                    setModal(null);
                }}
              >
                <p>
                  Where should these transactions and rules go? Your transaction
                  history will stay intact.
                </p>
                <label>
                  Move to category
                  <select name="target" required>
                    {data.categories
                      .filter((c) => c.id !== modal.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="button danger">
                  Move transactions and delete
                </button>
              </form>
            )}
            {modal.kind === "category" &&
              (() => {
                const c = categories.find((c) => c.id === modal.id)!;
                const rows = transactions.filter(
                  (t) =>
                    categorizeTransaction(t, data.rules, data.categories) ===
                    c.id,
                );
                return (
                  <>
                    <div className="category-detail-summary">
                      <span className="category-icon">
                        <CategoryIcon name={c.icon} size={25} />
                      </span>
                      <strong>{money(c.spent, "USD", 2)}</strong>
                      <p>
                        spent of {money(c.budget)} in {monthLabel(month)}
                      </p>
                      <span className={`status ${statusClass(c.status)}`}>
                        {c.status}
                      </span>
                      <Progress percentage={c.percentage} status={c.status} />
                      <p>
                        {money(Math.abs(c.remaining))}{" "}
                        {c.remaining < 0 ? "over budget" : "remaining"} ·{" "}
                        {c.percentage === null
                          ? "No limit set"
                          : `${c.percentage.toFixed(1)}% used`}
                      </p>
                    </div>
                    <div className="detail-actions">
                      <button
                        className="button primary"
                        onClick={() => setModal({ kind: "budget", id: c.id })}
                      >
                        Change budget
                      </button>
                      <button
                        className="button secondary"
                        onClick={() =>
                          setModal({ kind: "edit-category", id: c.id })
                        }
                      >
                        Edit category
                      </button>
                    </div>
                    <div className="detail-month-row">
                      <button
                        className="icon-button"
                        aria-label="Previous detail month"
                        onClick={() => setMonth(shiftMonth(month, -1))}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span>{monthLabel(month)}</span>
                      <button
                        className="icon-button"
                        aria-label="Next detail month"
                        onClick={() => setMonth(shiftMonth(month, 1))}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                    <label className="search-field">
                      <Search size={18} />
                      <span className="sr-only">
                        Search category transactions
                      </span>
                      <input
                        placeholder="Search transactions…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    {txRows(rows)}
                  </>
                );
              })()}
          </fieldset>
        </Dialog>
      )}
    </div>
  );
}
function Progress({
  percentage,
  status,
}: {
  percentage: number | null;
  status: string;
}) {
  return (
    <span
      className={`progress ${statusClass(status)}`}
      role="progressbar"
      aria-label="Budget usage"
      aria-valuenow={Math.max(0, Math.min(100, percentage ?? 0))}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={
        percentage === null
          ? "No budget set"
          : `${Math.round(percentage)}% of budget used`
      }
    >
      <span
        style={{ width: `${Math.max(0, Math.min(100, percentage ?? 0))}%` }}
      />
    </span>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Wallet size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
