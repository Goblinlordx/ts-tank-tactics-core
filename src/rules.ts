class Rule<T> {
  constructor(public validator: (v: T) => null | string[]) {}

  validate(v: T): void {
    const err = this.validator(v)
    if (err) {
      throw err
    }
  }

  chain(f: (v: T) => Rule<T>) {
    return new Rule<T>((v) => {
      const rule = f(v)
      return rule.validator(v)
    })
  }

  errMap(f: (err: null | string[]) => null | string[]) {
    return new Rule((v: T) => {
      const res = this.validator(v)
      return f(res)
    })
  }
}

const named = function <T>(name: string, rule: Rule<T>) {
  return rule.errMap((err) => (err ? err.map((e) => `[named: ${name}]: ${e}`) : null))
}

const many = function <T>(...rules: Rule<T>[]) {
  return new Rule<T>((v) => {
    const errs = []
    for (const r of rules) {
      const err = r.validator(v)
      if (err != null) errs.push(...err)
    }
    return errs.length > 0 ? errs : null
  })
}

const map = <T, U>(f: (v: T) => U, rule: Rule<U>) =>
  new Rule<T>((v: T) => {
    return rule.validator(f(v))
  })

const eq = function <T>(t: T) {
  return new Rule<T>((v: T) => {
    return v === t ? null : [`eq: must equal "${t}", got: "${v}"`]
  })
}

const min = function (t: number) {
  return new Rule((v: number) => {
    return v >= t ? null : ["min: invalid value"]
  })
}

const max = function (t: number) {
  return new Rule((v: number) => {
    return v <= t ? null : [`max: value out of bounds, expected: <= ${t}, got: ${v}`]
  })
}

const str = new Rule((v: string) => {
  return typeof v === "string" ? null : ["str: must be string"]
})

const int = new Rule((v: number) => {
  return Number.isInteger(v) ? null : ["int: must be integer"]
})

const nop = function <T>() {
  return new Rule<T>((v) => null)
}

const chain = function <T>(f: (v: T) => Rule<T>) {
  return new Rule<T>((v) => {
    const r = f(v)
    return r.validator(v)
  })
}

const field = function <T, K extends string & keyof T>(k: K, rule: Rule<T[K]>) {
  return map((v: T) => v[k], rule).errMap((err) => (err ? err.map((e) => `[field: ${k}]: ${e}`) : null))
}

type A = {
  arr: string[]
  test: string
  n: number
}

const x: Rule<A> = named(
  "A",
  chain((v) => many(field("n", many(int, min(1), max(v.arr.length - 1))), field("test", many(eq("asdf")))))
)

const res = x.validator({ test: "asf", n: 2, arr: ["a", "b"] })
console.log("\n" + res?.join("\n"))
