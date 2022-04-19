import { TorusKnotBufferGeometry } from 'three';
import {
    DataTransportPayload,
    WorkerTaskDirectorWorker,
    WorkerTaskDirectorDefaultWorker
} from 'wtd-core';
import {
    MeshTransportPayload,
    MeshTransportPayloadUtils
} from 'wtd-three-ext';

declare const self: DedicatedWorkerGlobalScope;

class TransferableWorkerTest4 extends WorkerTaskDirectorDefaultWorker implements WorkerTaskDirectorWorker {

    init(payload: DataTransportPayload) {
        console.log(`TransferableWorkerTest4#init: name: ${payload.name} id: ${payload.id} cmd: ${payload.cmd} workerId: ${payload.workerId}`);
        payload.cmd = 'initComplete';
        self.postMessage(payload);
    }

    execute(payload: DataTransportPayload) {
        console.log(`TransferableWorkerTest4#execute: name: ${payload.name} id: ${payload.id} cmd: ${payload.cmd} workerId: ${payload.workerId}`);
        if (payload.params) {
            const bufferGeometry = new TorusKnotBufferGeometry(20, 3, payload.params.segments as number, payload.params.segments as number);
            bufferGeometry.name = payload.name;

            const mtp = new MeshTransportPayload('execComplete', payload.id);
            MeshTransportPayloadUtils.setBufferGeometry(mtp, bufferGeometry, 0);
            const packed = MeshTransportPayloadUtils.packMeshTransportPayload(mtp, false);
            self.postMessage(packed.payload, packed.transferables);
        }

    }
}

const worker = new TransferableWorkerTest4();
self.onmessage = message => worker.comRouting(message);
