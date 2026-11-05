import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { fileExtension } from "../../shared/outputMedia.js";

function fileNameOf(url) {
  const query = String(url).split("?")[1] || "";
  const params = new URLSearchParams(query);
  return params.get("name") || params.get("filename") || String(url).split("?")[0];
}

async function loadModel(url) {
  const ext = fileExtension(fileNameOf(url));
  if (ext === "glb" || ext === "gltf") return (await new GLTFLoader().loadAsync(url)).scene;
  if (ext === "obj") return new OBJLoader().loadAsync(url);
  if (ext === "fbx") return new FBXLoader().loadAsync(url);
  if (ext === "stl" || ext === "ply") {
    const geometry = await (ext === "stl" ? new STLLoader() : new PLYLoader()).loadAsync(url);
    geometry.computeVertexNormals?.();
    const material = geometry.hasAttribute("color")
      ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })
      : new THREE.MeshStandardMaterial({ color: 0xb8bcc8, roughness: 0.6, metalness: 0.1 });
    if (ext === "ply" && !geometry.index && !geometry.hasAttribute("normal")) {
      return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.01, vertexColors: geometry.hasAttribute("color") }));
    }
    return new THREE.Mesh(geometry, material);
  }
  throw new Error(`Chưa xem trước được định dạng .${ext || "?"} — tải file về để mở bằng phần mềm 3D.`);
}

/** Orbit viewer for 3D outputs (glb · gltf · obj · fbx · stl · ply). Loaded lazily. */
export default function Model3DViewer({ url }) {
  const hostRef = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url) return undefined;
    let disposed = false;
    setError("");
    setLoading(true);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 4);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frame = 0;
    const tick = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };

    loadModel(url).then(model => {
      if (disposed) return;
      // Frame the model: centre it and back the camera off to fit its bounding sphere.
      const box = new THREE.Box3().setFromObject(model);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      model.position.sub(sphere.center);
      // Show both faces: generated meshes often have flipped normals / winding.
      model.traverse(object => {
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
        materials.forEach(material => {
          material.side = THREE.DoubleSide;
        });
      });
      scene.add(model);
      const radius = sphere.radius || 1;
      camera.near = radius / 100;
      camera.far = radius * 100;
      camera.position.set(radius * 1.6, radius * 0.9, radius * 2.2);
      camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0);
      setLoading(false);
      tick();
    }).catch(err => {
      if (!disposed) {
        setLoading(false);
        setError(err?.message || String(err));
      }
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse(object => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
        materials.forEach(material => material.dispose?.());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url]);

  return (
    <div className="model3dViewer" ref={hostRef}>
      {loading ? <span className="model3dStatus">Đang tải model 3D…</span> : null}
      {error ? <span className="model3dStatus isError">{error}</span> : null}
    </div>
  );
}
