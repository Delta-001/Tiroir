import { React, RN } from "../discord";

const { Animated, PanResponder, Vibration } = RN;

export interface DragHandle {
    /** À passer au Pressable de l'élément : maintenir démarre le déplacement */
    onLongPress(e: any): void;
    onPressOut(): void;
    dragging: boolean;
}

/** Permet à un onglet d'être prévenu quand on arrive en bas du panneau (défilement infini) */
export const ScrollEndContext = React.createContext({ setOnEnd: (_: (() => void) | undefined) => { } });

/** Bloque le défilement du panneau pendant un glisser */
export const DragContext = React.createContext({ setDragging: (_: boolean) => { } });

interface DragState {
    from: number;
    to: number;
    startY: number;
    granted: boolean;
    shifts: number[];
}

/**
 * Liste réordonnable : maintenir un élément le détache, le glisser montre sa future place,
 * le relâcher l'y dépose. Un appui court reste un simple appui.
 */
export function Sortable<T>({ items, getKey, onMove, renderItem }: {
    items: T[];
    getKey(item: T): string;
    onMove(from: number, to: number): void;
    renderItem(item: T, handle: DragHandle): any;
}) {
    const { setDragging } = React.useContext(DragContext);
    const layouts = React.useRef([] as { y: number; h: number; }[]);
    const anims = React.useRef(new Map() as Map<string, any>);
    const drag = React.useRef(null as DragState | null);
    const itemsRef = React.useRef(items);
    itemsRef.current = items;
    const pendingReset = React.useRef(false);
    const [dragKey, setDragKey] = React.useState(null as string | null);

    const anim = (key: string) => {
        let a = anims.current.get(key);
        if (!a) anims.current.set(key, a = new Animated.Value(0));
        return a;
    };

    // Une fois l'ordre mis à jour, on retire les décalages
    React.useLayoutEffect(() => {
        if (!pendingReset.current) return;
        pendingReset.current = false;
        for (const a of anims.current.values()) a.setValue(0);
    }, [items]);

    function finish(commit: boolean) {
        const d = drag.current;
        if (!d) return;
        drag.current = null;
        setDragKey(null);
        setDragging(false);

        if (commit && d.to !== d.from) {
            pendingReset.current = true;
            onMove(d.from, d.to);
        } else {
            for (const a of anims.current.values()) Animated.spring(a, { toValue: 0, useNativeDriver: true }).start();
        }
    }

    function move(pageY: number) {
        const d = drag.current;
        if (!d) return;
        const dy = pageY - d.startY;
        const list = itemsRef.current;
        const L = layouts.current;
        const from = L[d.from];
        if (!from) return;

        anim(getKey(list[d.from])).setValue(dy);
        const center = from.y + from.h / 2 + dy;

        let to = d.from;
        L.forEach((l, i) => {
            if (!l) return;
            const mid = l.y + l.h / 2;
            if (i < d.from && center < mid) to = Math.min(to, i);
            if (i > d.from && center > mid) to = Math.max(to, i);
        });
        if (to !== d.to) Vibration.vibrate(8);
        d.to = to;

        list.forEach((item, i) => {
            if (i === d.from) return;
            const shift = d.from < to && i > d.from && i <= to ? -from.h
                : to < d.from && i >= to && i < d.from ? from.h
                    : 0;
            if (d.shifts[i] === shift) return;
            d.shifts[i] = shift;
            Animated.timing(anim(getKey(item)), { toValue: shift, duration: 140, useNativeDriver: true }).start();
        });
    }

    const responder = React.useMemo(() => PanResponder.create({
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponderCapture: () => !!drag.current,
        onMoveShouldSetPanResponder: () => !!drag.current,
        onPanResponderGrant: () => { if (drag.current) drag.current.granted = true; },
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (e: any) => move(e.nativeEvent.pageY),
        onPanResponderRelease: () => finish(true),
        onPanResponderTerminate: () => finish(false)
    }), []);

    return (
        <RN.View {...responder.panHandlers}>
            {items.map((item, i) => {
                const key = getKey(item);
                const dragging = dragKey === key;
                const handle: DragHandle = {
                    dragging,
                    onLongPress(e: any) {
                        drag.current = { from: i, to: i, startY: e.nativeEvent.pageY, granted: false, shifts: [] };
                        setDragKey(key);
                        setDragging(true);
                        Vibration.vibrate(20);
                    },
                    onPressOut() {
                        // Relâché sans bouger après l'appui long : on annule
                        setTimeout(() => { if (drag.current && !drag.current.granted) finish(false); }, 60);
                    }
                };
                return (
                    <Animated.View
                        key={key}
                        onLayout={(e: any) => { layouts.current[i] = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height }; }}
                        style={{
                            transform: [{ translateY: anim(key) }, { scale: dragging ? 1.03 : 1 }],
                            zIndex: dragging ? 10 : 0,
                            elevation: dragging ? 8 : 0,
                            opacity: dragging ? 0.95 : 1
                        }}
                    >
                        {renderItem(item, handle)}
                    </Animated.View>
                );
            })}
        </RN.View>
    );
}

export function moveItem<T>(array: T[], from: number, to: number): T[] {
    const copy = [...array];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
}
