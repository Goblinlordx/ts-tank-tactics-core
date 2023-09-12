import typia from "typia"

interface EventHandler<T, U> {
  isInput(v: unknown): v is T
  apply(event: T, state: U): U
  revert(event: T, state: U): U
}

interface Transform<T> {
  apply(state: T): T
  revert(state: T): T
}

class Processor<T, U> {
  constructor(private handler: EventHandler<T, U>) {}
  isInput(v: unknown): v is T {
    return this.handler.isInput(v)
  }
  apply(e: T, state: U) {
    return this.handler.apply(e, state)
  }
  revert(e: T, state: U) {
    return this.handler.revert(e, state)
  }

  add<V>(p: Processor<V, U>): Processor<T | V, U> {
    return new Processor({
      isInput: (v: unknown): v is T | V => p.isInput(v) || this.isInput(v),
      apply: (e: T | V, state: U) => {
        if (p.isInput(e)) {
          return p.apply(e, state)
        } else {
          return this.apply(e, state)
        }
      },
      revert: (e: T | V, state: U) => {
        if (p.isInput(e)) {
          return p.revert(e, state)
        } else {
          return this.revert(e, state)
        }
      }
  })
  }
}

const xf = <T, U>(p: Processor<T, U>, transform: Transform<U>) =>
  new Processor<T, U>({
    isInput: p.isInput,
    apply: (e, s) => transform.apply(p.apply(e, s)),
    revert: (e, s) => p.revert(e, transform.revert(s)),
  })

const merge = <LT, RT, U>(left: EventHandler<LT, U>, right: EventHandler<RT, U>): Processor<LT | RT, U> =>
  new Processor<LT | RT, U>({
    isInput(v: unknown): v is LT | RT {
      return left.isInput(v) || right.isInput(v)
    },
    apply(event: LT | RT, state: U): U {
      if (left.isInput(event)) {
        return left.apply(event, state)
      } else {
        return right.apply(event, state)
      }
    },
    revert(event: LT | RT, state: U): U {
      if (left.isInput(event)) {
        return left.revert(event, state)
      } else {
        return right.revert(event, state)
      }
    },
  })
