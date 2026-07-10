import bachBwv846Example from "./bachBwv846Example.json";
import brahmsWaltzOp39No15Example from "./brahmsWaltzOp39No15Example.json";
import schumannHascheMannExample from "./schumannHascheMannExample.json";
import type { MelodyClip } from "../types/idea";

export type AudioExample = {
  id: string;
  title: string;
  description: string;
  melody: MelodyClip;
};

function cloneMelody(clip: MelodyClip): MelodyClip {
  return JSON.parse(JSON.stringify(clip)) as MelodyClip;
}

function makeBachPrelude(): MelodyClip {
  return cloneMelody(bachBwv846Example as MelodyClip);
}

export const audioExamples: AudioExample[] = [
  {
    id: "bach-bwv-846",
    title: "Bach C大调前奏曲 BWV 846",
    description: "公版巴洛克分解和弦示例，适合测试长篇复音、导出和可视化。",
    melody: makeBachPrelude()
  },
  {
    id: "brahms-waltz-op39-no15",
    title: "Brahms 圆舞曲 Op.39 No.15",
    description: "公版浪漫派短圆舞曲原曲，适合测试三拍子、旋转感旋律和钢琴复音。",
    melody: cloneMelody(brahmsWaltzOp39No15Example as MelodyClip)
  },
  {
    id: "schumann-hasche-mann",
    title: "Schumann 童年情景：Hasche-Mann Op.15 No.3",
    description: "公版浪漫派短曲原曲，适合测试快速跳跃、明暗对比和完整短篇播放。",
    melody: cloneMelody(schumannHascheMannExample as MelodyClip)
  }
];
