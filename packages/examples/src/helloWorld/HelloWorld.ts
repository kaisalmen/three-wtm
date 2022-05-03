import {
    PayloadType,
    WorkerTaskDirector,
    DataTransportPayload
} from 'wtd-core';

/**
 * Hello World example showing standard and module worker using three
 */
class WorkerTaskDirectorHelloWorldExample {

    private workerTaskDirector: WorkerTaskDirector = new WorkerTaskDirector({
        defaultMaxParallelExecutions: 1,
        verbose: true
    });

    async run() {
        let t0: number;
        let t1: number;
        const taskName = 'WorkerModule';

        // register the module worker
        this.workerTaskDirector.registerTask(taskName, {
            module: true,
            blob: false,
            url: new URL('../worker/helloWorldWorker', import.meta.url)
        });

        // init the worker task without any payload (worker init without function invocation on worker)
        this.workerTaskDirector.initTaskType(taskName)
            .then((x: unknown) => {
                console.log(`initTaskType then: ${x}`);
                t0 = performance.now();

                // once the init Promise returns enqueue the execution
                const moduleWorkerPayload = new DataTransportPayload({
                    id: 0,
                    name: taskName
                });
                this.workerTaskDirector.enqueueWorkerExecutionPlan({
                    taskTypeName: moduleWorkerPayload.name,
                    payload: moduleWorkerPayload,
                    // decouple result evaluation ...
                    onComplete: (e: unknown) => { console.log('Received final command: ' + (e as PayloadType).cmd); }
                }).then((x: unknown) => {
                    // promise result handling
                    console.log(`enqueueWorkerExecutionPlan then: ${x}`);
                    t1 = performance.now();
                    alert(`Worker execution has been completed after ${t1 - t0}ms.`);
                });
            }).catch(
                // error handling
                (x: unknown) => console.error(x)
            );
    }
}

const app = new WorkerTaskDirectorHelloWorldExample();
app.run();
