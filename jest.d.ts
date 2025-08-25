declare module 'jest' {
    export interface Matchers<R> {
        toBeWithinRange(floor: number, ceiling: number): R;
    }
}