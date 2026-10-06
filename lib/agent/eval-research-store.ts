type Row = Record<string, unknown>;

export type EvalResearchRows = {
  research_cache: Row[];
  research_queries: Row[];
  research_sources: Row[];
};

class ResearchQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;
  private operation: "select" | "insert" | "upsert" = "select";
  private inserted: Row[] = [];
  private headOnly = false;

  constructor(
    private readonly table: keyof EvalResearchRows,
    private readonly rows: EvalResearchRows,
    private readonly nextId: (table: keyof EvalResearchRows) => string
  ) {}

  select(_columns: string, options?: { count?: string; head?: boolean }) {
    this.headOnly = options?.head === true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  gte(column: string, value: string) {
    const minimum = new Date(value).getTime();
    this.filters.push(
      (row) => new Date(String(row[column])).getTime() >= minimum
    );
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.orders.push({ column, ascending: options.ascending });
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  insert(value: Row | Row[]) {
    this.operation = "insert";
    this.inserted = (Array.isArray(value) ? value : [value]).map((row) => ({
      id: row.id ?? this.nextId(this.table),
      ...(this.table === "research_queries" && !row.created_at
        ? { created_at: new Date().toISOString() }
        : {}),
      ...row,
    }));
    this.rows[this.table].push(...this.inserted);
    return this;
  }

  upsert(value: Row) {
    this.operation = "upsert";
    const existing = this.rows[this.table].find(
      (row) =>
        row.organization_id === value.organization_id &&
        row.provider === value.provider &&
        row.query_hash === value.query_hash
    );
    if (existing) Object.assign(existing, value);
    else {
      const row = { id: value.id ?? this.nextId(this.table), ...value };
      this.rows[this.table].push(row);
      this.inserted = [row];
    }
    return this;
  }

  async maybeSingle() {
    const result = this.execute();
    return {
      ...result,
      data: Array.isArray(result.data) ? (result.data[0] ?? null) : null,
    };
  }

  async single() {
    const result = this.execute();
    const data = Array.isArray(result.data) ? result.data : [];
    return {
      ...result,
      data: data[0] ?? null,
      error: data.length === 1 ? null : new Error("Expected one row"),
    };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    if (this.operation !== "select")
      return { data: this.inserted, count: this.inserted.length, error: null };
    let data = this.rows[this.table].filter((row) =>
      this.filters.every((filter) => filter(row))
    );
    const count = data.length;
    for (const order of [...this.orders].reverse()) {
      data = [...data].sort((left, right) => {
        const comparison = String(left[order.column] ?? "").localeCompare(
          String(right[order.column] ?? "")
        );
        return order.ascending ? comparison : -comparison;
      });
    }
    if (this.rowLimit !== null) data = data.slice(0, this.rowLimit);
    return {
      data: this.headOnly ? null : data,
      count: this.headOnly ? count : null,
      error: null,
    };
  }
}

export function createEvalResearchStore() {
  const rows: EvalResearchRows = {
    research_cache: [],
    research_queries: [],
    research_sources: [],
  };
  let sourceId = 0x101;
  let queryId = 1;
  const admin = {
    from(table: keyof EvalResearchRows) {
      return new ResearchQuery(table, rows, (name) => {
        const id = name === "research_sources" ? sourceId++ : queryId++;
        return `00000000-0000-4000-8000-${id.toString(16).padStart(12, "0")}`;
      });
    },
  };
  return { admin, rows };
}
