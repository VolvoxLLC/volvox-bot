export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function rejectWhenAborted(signal: AbortSignal) {
  return new Promise<never>((_resolve, reject) => {
    const rejectAbort = () => reject(new DOMException('Aborted', 'AbortError'));

    if (signal.aborted) {
      rejectAbort();
      return;
    }

    signal.addEventListener('abort', rejectAbort, { once: true });
  });
}

export function abortableFetch<TResponse extends Response>(deferred: ReturnType<typeof createDeferred<TResponse>>) {
  return (_input: RequestInfo | URL, init?: RequestInit) => {
    const requestSignal = init?.signal;
    if (!(requestSignal instanceof AbortSignal)) {
      throw new TypeError('Expected abort signal');
    }

    return Promise.race([deferred.promise, rejectWhenAborted(requestSignal)]);
  };
}
