import type { PngStickerPack } from './index'

import idleImg from '../assets/stickers/kawaii/idle.png'
import thinkingImg from '../assets/stickers/kawaii/thinking.png'
import workingImg from '../assets/stickers/kawaii/working.png'
import readingImg from '../assets/stickers/kawaii/reading.png'
import waitingImg from '../assets/stickers/kawaii/waiting.png'
import doneImg from '../assets/stickers/kawaii/done.png'
import errorImg from '../assets/stickers/kawaii/error.png'

export const kawaiiPack: PngStickerPack = {
  id: 'kawaii',
  name: 'Kawaii',
  type: 'png',
  faces: {
    idle: idleImg,
    thinking: thinkingImg,
    working: workingImg,
    reading: readingImg,
    waiting: waitingImg,
    done: doneImg,
    error: errorImg
  }
}
