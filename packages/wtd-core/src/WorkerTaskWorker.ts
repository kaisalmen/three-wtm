import { Payload } from './Payload.js';
import { RawPayload } from './RawPayload.js';
import { WorkerTaskMessageConfig } from './WorkerTaskMessage.js';

export type WorkerTaskWorker = {

    init?(message: WorkerTaskMessageConfig): void;

    intermediate?(message: WorkerTaskMessageConfig): void;

    execute(message: WorkerTaskMessageConfig): void;
}

export type InterComWorker = {

    interComInit?(message: WorkerTaskMessageConfig): void;

    interComInitComplete?(message: WorkerTaskMessageConfig): void;

    interComIntermediate?(message: WorkerTaskMessageConfig): void;

    interComIntermediateConfirm?(message: WorkerTaskMessageConfig): void;

    interComExecute?(message: WorkerTaskMessageConfig): void;

    interComExecuteComplete?(message: WorkerTaskMessageConfig): void;
}

export class InterComPortHandler {

    private ports: Map<string, MessagePort> = new Map();

    registerPort(name: string, payload: Payload | undefined, onmessage: (message: MessageEvent<unknown>) => void) {
        const port = payload ? (payload as RawPayload).message.raw.port as MessagePort : undefined;
        if (!port) {
            throw new Error(`${payload?.message ?? 'undefined'} is not a RawPayload. Unable to extract a port.`);
        }
        this.ports.set(name, port);
        port.onmessage = onmessage;
    }

    postMessageOnPort(target: string, message: WorkerTaskMessageConfig, options?: StructuredSerializeOptions) {
        this.ports.get(target)?.postMessage(message, options);
    }
}

export const comRouting = (workerImpl: WorkerTaskWorker | InterComWorker, message: MessageEvent<unknown>, delegate?: (ev: MessageEvent<unknown>) => unknown) => {
    const wtmt = (message as MessageEvent).data as WorkerTaskMessageConfig;
    if (wtmt && wtmt.cmd) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = (workerImpl as any);
        const funcName = wtmt.cmd ?? 'unknown';
        if (typeof obj[funcName] === 'function') {
            obj[funcName](wtmt);
        }
    } else if (delegate) {
        delegate(message);
    }
};
