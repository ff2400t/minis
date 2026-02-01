export type InitialState<T> = T | (() => T);
export type NewState<T> = T | ((previousState: T) => T);
export type StateUpdater<T> = (value: NewState<T>) => void;
export type StateTuple<T> = readonly [T, StateUpdater<T>];
export interface UseState {
  <T>(): StateTuple<T | undefined>;
  <T>(value?: InitialState<T>): StateTuple<T>;
}
declare const useState: UseState;
export { useState };

export interface Ref<T> {
  current: T;
}
export declare function useRef<T>(): Ref<T | undefined>;
export declare function useRef<T>(initialValue: T): Ref<T>;

export type Reducer<S, A> = (state: S, action: A) => S;
declare const useReducer: <S, I, A>(
  _: Reducer<S, A>,
  initialState: I,
  init?: ((_: I) => S) | undefined,
) => readonly [S, (action: A) => void];
export { useReducer };

export declare const useCallback: <T extends Function>(
  fn: T,
  inputs: unknown[],
) => T;

/**
 * @function
 * @template T
 * @param  {() => T} fn function to memoize
 * @param  {unknown[]} values dependencies to the memoized computation
 * @return {T} The next computed value
 */
export declare const useMemo: <T>(fn: () => T, values: unknown[]) => T;
