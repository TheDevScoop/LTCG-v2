import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { WebGPURenderer } from "three/webgpu";
import { BoardContent, type BoardContentProps } from "./BoardContent";

export interface BoardSceneProps extends BoardContentProps {
  children: React.ReactNode;
}

export function BoardScene({ children, ...boardProps }: BoardSceneProps) {
  return (
    <div className="relative w-full h-dvh">
      {/* 3D Canvas layer */}
      <Canvas
        gl={async (props) => {
          const renderer = new WebGPURenderer({
            canvas: (props as any).canvas as HTMLCanvasElement,
            antialias: true,
            powerPreference: "high-performance",
          });
          await renderer.init();
          return renderer as any;
        }}
        camera={{
          position: [0, 8, 5],
          fov: 45,
          near: 0.1,
          far: 100,
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Suspense fallback={null}>
          <BoardContent {...boardProps} />
        </Suspense>
      </Canvas>

      {/* DOM overlay layer */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 1 }}
      >
        <div className="pointer-events-auto w-full h-full">{children}</div>
      </div>
    </div>
  );
}
