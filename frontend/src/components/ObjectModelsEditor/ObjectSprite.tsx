'use client';

import React, { useEffect, useRef } from "react";

interface ObjectSpriteProps {
  objectId: string;
  size?: number;
}

export function ObjectSprite({ objectId, size = 24 }: ObjectSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;

    const detailImg = document.createElement("img");
    const mainImg = document.createElement("img");

    let loadedCount = 0;
    const checkLoaded = () => {
      loadedCount++;
      if (loadedCount === 2) {
        ctx.clearRect(0, 0, size, size);

        if (mainImg.complete && mainImg.naturalWidth > 0) {
          ctx.drawImage(mainImg, 0, 0, size, size);
        }

        if (detailImg.complete && detailImg.naturalWidth > 0) {
          ctx.drawImage(detailImg, 0, 0, size, size);
        }
      }
    };

    detailImg.onerror = checkLoaded;
    mainImg.onerror = checkLoaded;
    detailImg.onload = checkLoaded;
    mainImg.onload = checkLoaded;

    detailImg.src = `/gd/objects/detail/${objectId}.png`;
    mainImg.src = `/gd/objects/main/${objectId}.png`;
  }, [objectId, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="image-rendering-pixelated"
    />
  );
}
