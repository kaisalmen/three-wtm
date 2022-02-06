import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';

import { WorkerTaskManager } from '/src/loaders/workerTaskManager/WorkerTaskManager.js';
import { GeometryTransport } from '/src/loaders/utils/TransportUtils.js';

class TransferableTestbed {

    constructor(elementToBindTo) {
        this.renderer = null;
        this.canvas = elementToBindTo;
        this.aspectRatio = 1;
        this.scene = null;
        this.cameraDefaults = {
            posCamera: new THREE.Vector3(1000.0, 1000.0, 1000.0),
            posCameraTarget: new THREE.Vector3(0, 0, 0),
            near: 0.1,
            far: 10000,
            fov: 45
        };
        this.camera = null;
        this.cameraTarget = this.cameraDefaults.posCameraTarget;
        this.controls = null;

        this.workerTaskManager = new WorkerTaskManager(1);
        this.workerTaskManager.setVerbose(true);

        this.taskTest1 = {
            execute: true,
            id: 1,
            name: 'transferableWorkerTest1',
            module: '/examples/worker/transferableWorkerTest1.js',
            materials: {},
            segments: 0
        };
        this.taskTest2 = {
            execute: true,
            id: 2,
            name: 'transferableWorkerTest2',
            module: '/examples/worker/transferableWorkerTest2.js',
            materials: {},
            segments: 0
        };
        this.taskTest3 = {
            execute: true,
            id: 3,
            name: 'transferableWorkerTest3',
            module: '/examples/worker/transferableWorkerTest3.js',
            materials: {},
            segments: 2048
        };
        this.taskTest4 = {
            execute: true,
            id: 4,
            name: 'transferableWorkerTest4',
            module: '/examples/worker/transferableWorkerTest4.js',
            materials: {},
            segments: 2048
        };
    }

    initGL() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            autoClear: true
        });
        this.renderer.setClearColor(0x050505);

        this.scene = new THREE.Scene();

        this.recalcAspectRatio();
        this.camera = new THREE.PerspectiveCamera(this.cameraDefaults.fov, this.aspectRatio, this.cameraDefaults.near, this.cameraDefaults.far);
        this.resetCamera();
        this.controls = new TrackballControls(this.camera, this.renderer.domElement);

        let ambientLight = new THREE.AmbientLight(0x404040);
        let directionalLight1 = new THREE.DirectionalLight(0xC0C090);
        let directionalLight2 = new THREE.DirectionalLight(0xC0C090);

        directionalLight1.position.set(- 100, - 50, 100);
        directionalLight2.position.set(100, 50, - 100);

        this.scene.add(directionalLight1);
        this.scene.add(directionalLight2);
        this.scene.add(ambientLight);

        let helper = new THREE.GridHelper(1000, 30, 0xFF4444, 0x404040);
        this.scene.add(helper);
    }

    resizeDisplayGL() {
        this.controls.handleResize();

        this.recalcAspectRatio();
        this.renderer.setSize(this.canvas.offsetWidth, this.canvas.offsetHeight, false);

        this.updateCamera();
    }

    recalcAspectRatio() {
        this.aspectRatio = (this.canvas.offsetHeight === 0) ? 1 : this.canvas.offsetWidth / this.canvas.offsetHeight;
    }

    resetCamera() {
        this.camera.position.copy(this.cameraDefaults.posCamera);
        this.cameraTarget.copy(this.cameraDefaults.posCameraTarget);

        this.updateCamera();
    }

    updateCamera() {
        this.camera.aspect = this.aspectRatio;
        this.camera.lookAt(this.cameraTarget);
        this.camera.updateProjectionMatrix();
    }

    render() {
        if (!this.renderer.autoClear) this.renderer.clear();
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }


    /**
     * Registers any selected task at the {@link WorkerTaskManager} and initializes them.
     *
     * @return {Promise<any>}
     */
    async initContent() {
        await this._initTask(this.taskTest1);
        await this._initTask(this.taskTest2);
        await this._initTask(this.taskTest3);
        await this._initTask(this.taskTest4);
    }

    _initTask(task) {
        this.workerTaskManager.registerTaskTypeWithUrl(task.name, true, task.module);
        return this.workerTaskManager.initTaskType(task.name, {});
    }

    async executeWorker(task) {

        let promiseExec = this.workerTaskManager.enqueueForExecution(task.name, {
            id: task.id,
            params: {
                name: task.name,
                materials: task.materials,
                segments: task.segments
            }
        },
            data => this._processMessage(data))
            .then(data => this._processMessage(data))
            .catch(e => console.error(e))

        await promiseExec;


    }

    _processMessage(payload) {
        switch (payload.cmd) {
            case this.taskTest1.name:
            case this.taskTest2.name:
            case this.taskTest3.name:
                console.log(payload);
                break;

            case this.taskTest4.name:
                console.log(payload);

                const mesh = new THREE.Mesh(
                    new GeometryTransport().loadData(payload).reconstruct(false).getBufferGeometry(),
                    new THREE.MeshPhongMaterial({ color: new THREE.Color(0xff0000) })
                );
                this.scene.add(mesh);
                break;

            case 'execComplete':
            case 'assetAvailable':
                switch (payload.type) {

                    case 'mesh':
                    case 'material':
                    case 'void':
                        break;

                    default:
                        console.error('Provided payload.type was neither mesh nor assetAvailable: ' + payload.cmd);
                        break;

                }
                break;

            default:
                console.error(payload.id + ': Received unknown command: ' + payload.cmd);
                break;
        }
    }

    async run() {

        await this.executeTask(this.taskTest1);
        await this.executeTask(this.taskTest2);
        await this.executeTask(this.taskTest3);
        await this.executeTask(this.taskTest4);

    }

    async executeTask(task) {
        if (task.execute) {

            console.time(task.name);
            await this.executeWorker(task);
            console.timeEnd(task.name);

        }
    }

}

let app = new TransferableTestbed(document.getElementById('example'));

let resizeWindow = function() {
    app.resizeDisplayGL();
};

let render = function() {
    requestAnimationFrame(render);
    app.render();
};

window.addEventListener('resize', resizeWindow, false);

console.log('Starting initialisation phase...');
app.initGL();
app.resizeDisplayGL();

render();

console.time('All tasks have been initialized');
app.initContent().then(x => {
    app.run();
    console.timeEnd('All tasks have been initialized');
}).catch(x => alert(x));
