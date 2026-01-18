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

type Reducer<S, A> = (state: S, action: A) => S;
declare const useReducer: <S, I, A>(
  _: Reducer<S, A>,
  initialState: I,
  init?: ((_: I) => S) | undefined,
) => readonly [S, (action: A) => void];
export { useReducer };

declare const useCallback: <T extends Function>(fn: T, inputs: unknown[]) => T;
export { useCallback };
