import { FunctionDefinition } from './definition';
import { FunctionsMemoryOptions, IFunctionDefinition } from './interface';

export type EndpointSpec<TArg, TResult> = (arg: TArg) => TResult; // can be just an empty object

export function spec<TArg, TResult>(fallback: EndpointSpec<TArg, TResult> = null): EndpointSpec<TArg, TResult> { return fallback || null; }

export type CompositeEndpointInfo = {
    [key: string]: EndpointSpec<any, any>;
};

export type ArgExtract<T, K extends keyof T> = T[K] extends EndpointSpec<infer TA, any> ? TA : never;
export type ResExtract<T, K extends keyof T> = T[K] extends EndpointSpec<any, infer TR> ? TR : never;

export type EndpointArg<T> = {
    [P in keyof T]?: ArgExtract<T, P>;
};

export type EndpointResult<T> = {
    [P in keyof T]?: ResExtract<T, P>;
};

export type EndpointSpecFunctions<T extends CompositeEndpointInfo> = {
    [P in keyof T]: IFunctionDefinition<ArgExtract<T, P>, ResExtract<T, P>>;
};

export class FunctionComposite<T extends CompositeEndpointInfo> {

    /* eslint-disable proposal/class-property-no-initialized */
    private readonly _endpoint: FunctionDefinition<EndpointArg<T>, EndpointResult<T>>;
    private readonly _specs = { } as EndpointSpecFunctions<T>;
    /* eslint-enable proposal/class-property-no-initialized */

    constructor(
        readonly info: T,
        name: string,
        namespace: string = '',
        timeout = 60,
        memory: FunctionsMemoryOptions = '256MB',
    ) {
        this._endpoint = new FunctionDefinition(name, namespace, timeout, memory);

        Object.keys(info).map((k: keyof T) => {
            this._specs[k] = this.getSpec(k);
        });
    }

    public get rootEndpoint(): IFunctionDefinition<EndpointArg<T>, EndpointResult<T>> { return this._endpoint; }

    public get specs(): Readonly<EndpointSpecFunctions<T>> { return this._specs; }

    private getSpec<K extends keyof T, TArg extends ArgExtract<T, K>, TResult extends ResExtract<T, K>>(key: K): IFunctionDefinition<TArg, TResult> {
        return this._endpoint.specify<TArg, TResult>(
            (a: TArg) => ({ [key]: a } as EndpointArg<T>),
            (r: EndpointResult<T>) => r[key] as TResult,
        );
    }
}

export type CompositionExport<T extends CompositeEndpointInfo> = {
    (): FunctionComposite<T>;
} & EndpointSpecFunctions<T>;

export function createCompositionExport<T extends CompositeEndpointInfo>(definition: FunctionComposite<T>): CompositionExport<T> {
    const getter = (() => definition) as CompositionExport<T>;
    Object.assign(getter, definition.specs);
    return getter;
}
