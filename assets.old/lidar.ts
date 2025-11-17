
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  BoxGeometry,
  MeshBasicMaterial,
  AmbientLight,
  Color,
  Mesh,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Potree, PointShape, PointSizeType, PointColorType } from 'potree-core';
const scene = new Scene();
console.log(Potree, "PO");
const camera = new PerspectiveCamera(60, 1, 0.1, 10000);

const canvas = document.getElementById("canvas");

const renderer = new WebGLRenderer({canvas:canvas});

const geometry = new BoxGeometry(1, 1, 1);
const material = new MeshBasicMaterial({color: 0x00ff00});
const cube = new Mesh(geometry, material);
scene.add(cube);
scene.add(new AmbientLight(0xffffff));
scene.background = new Color().setHex(0xeeeeff);

const controls = new OrbitControls(camera, renderer.domElement);
console.log(controls.setScale);
controls.setScale = newScale => { console.log(scope); controls.scale = scale; };
camera.position.set(...[
	290352.7467103761,
	442945.3966457916,
	44.00194173504403,
]);
camera.rotation.set(1, 0, 1);
camera.up.z = 1;
camera.up.y = 0;
controls.enableZoom = true;
controls.zoomSpeed = 1.2;

controls.target.set(...[
			290567.9582265408,
			441333.29357070115,
			-29.945845531508695,
]);
controls.update();

const pointClouds = [];

const baseUrl = "/pointclouds/dunluce.potree/";
const potree = new Potree();
potree.loadPointCloud("metadata.json", url => `${baseUrl}${url}`).then(pointcloud => {
			let material = pointcloud.material;
			material.size = 0.6;
			material.pointSizeType = PointSizeType.ADAPTIVE;
			material.pointColorType = PointColorType.INTENSITY;

				material.inputColorEncoding = 1;
				material.outputColorEncoding = 1;
			material.shape = PointShape.SQUARE;

			console.log(pointcloud);
			scene.clear();
			scene.add(pointcloud);

			pointClouds.push(pointcloud);
});

function loop()
{
   potree.updatePointClouds(pointClouds, camera, renderer);

	controls.update();
	renderer.render(scene, camera);

	requestAnimationFrame(loop);
};
loop();
