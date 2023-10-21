import {
    RawPayload,
    WorkerTaskDefaultWorker,
    WorkerTaskMessage,
    WorkerTaskMessageType
} from 'wtd-core';

declare const self: DedicatedWorkerGlobalScope;

export class Com2Worker extends WorkerTaskDefaultWorker {

    init(message: WorkerTaskMessageType) {
        const initComplete = WorkerTaskMessage.createFromExisting(message, 'initComplete');
        self.postMessage(initComplete);
    }

    intermediate(message: WorkerTaskMessageType): void {
        const rawPayload = message.payloads[0] as RawPayload;
        console.log(`Worker1 said: ${rawPayload.message.hello}`);

        const execComplete = WorkerTaskMessage.createFromExisting(message, 'execComplete');
        const payload = new RawPayload();
        payload.message = { hello: 'Worker 2 finished!' };
        execComplete.addPayload(payload);

        // no need to pack as there aren't any buffers used
        self.postMessage(execComplete);
    }

    execute(message: WorkerTaskMessageType) {
        const port = (message.payloads[0] as RawPayload).message.port as MessagePort;
        port.onmessage = message => worker.comRouting(message);

        const sendWorker1 = WorkerTaskMessage.createFromExisting(message, 'intermediate');
        const payload = new RawPayload();
        payload.message = { hello: 'Hi Worker 1!' };
        sendWorker1.addPayload(payload);
        port.postMessage(sendWorker1);
    }
}

const worker = new Com2Worker();
self.onmessage = message => worker.comRouting(message);
