import { describe, expect, it } from 'vitest';
import { facing, faces, onFace, projector } from './isometric';
import { parts } from './ExplodedView';

describe('等角投影', () => {
  it('預設視角（前左上方）看得到側板面、前面板與頂面', () => {
    const view = { yaw: 38, pitch: -26 };
    const seen = faces({ c: [0, 0, 0], size: [10, 10, 10] }).filter(f => facing(f, view)).map(f => f.id).sort();
    expect(seen).toEqual(['f', 'l', 't']);
  });

  it('面上的座標以 mm 計，從面的原點沿兩條邊量起', () => {
    const top = faces({ c: [0, 0, 0], size: [100, 20, 40] }).find(f => f.id === 't')!;
    expect(onFace(top, 100, 40)).toEqual([50, -10, 20]);
  });

  it('不旋轉時投影就是 x、y，深度是 z', () => {
    expect(projector({ yaw: 0, pitch: 0 })([3, 4, 5])).toEqual([3, 4, 5]);
  });
});

describe('分解圖零件', () => {
  it('沒選零件時用通用尺寸，每個類別都有可點的零件', () => {
    const cats = new Set(parts({}).list.map(p => p.cat));
    expect([...cats].sort()).toEqual(['cooler', 'cpu', 'gpu', 'motherboard', 'psu', 'ram', 'ssd']);
  });
});
