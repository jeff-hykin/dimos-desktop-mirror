import { useCallback, useEffect, useRef, useState } from "react"

/** Fetch now and every `intervalMs`; `refresh()` forces a fetch. Keeps the last good value on errors. */
export function usePoll<T>(load: () => Promise<T>, intervalMs: number) {
    const [data, setData] = useState<T | null>(null)
    const [error, setError] = useState<string | null>(null)
    const loadRef = useRef(load)
    loadRef.current = load
    const refresh = useCallback(async () => {
        try {
            setData(await loadRef.current())
            setError(null)
        } catch (caught) {
            setError((caught as Error).message)
        }
    }, [])
    useEffect(() => {
        refresh()
        const timer = setInterval(refresh, intervalMs)
        return () => clearInterval(timer)
    }, [refresh, intervalMs])
    return { data, error, refresh }
}
