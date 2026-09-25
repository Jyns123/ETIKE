import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Ancho disponible de un contenedor (los graficos se redibujan al cambiar). */
export function useAncho<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Numero que cuenta desde 0 hasta el valor cuando el elemento entra en pantalla. */
export function useConteo<T extends Element = HTMLElement>(valor: number, duracion = 1.4, desde = 0) {
  const ref = useRef<T>(null);
  const visto = useInView(ref, { once: true, margin: "-40px" });
  const reducido = useReducedMotion();
  const [v, setV] = useState(reducido ? valor : desde);
  const previo = useRef(desde);
  useEffect(() => {
    if (!visto) return;
    if (reducido) {
      setV(valor);
      return;
    }
    const c = animate(previo.current, valor, {
      duration: duracion,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (x) => setV(x),
    });
    previo.current = valor;
    return () => c.stop();
  }, [valor, visto, reducido, duracion]);
  return [ref, v] as const;
}

/** Guarda una preferencia del visor (tema, etc.). El storage puede no existir. */
export function useLocal<T extends string>(clave: string, inicial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(clave) as T) || inicial;
    } catch {
      return inicial;
    }
  });
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(clave, x);
    } catch {
      /* modo privado: solo en memoria */
    }
  };
  return [v, set];
}
