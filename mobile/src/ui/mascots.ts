import type { MascotId } from '../types';

export const mascots = [
  { id: 'dinosaur', name: '憨批批', color: '#E8F3EE', image: require('../../assets/mascots/real-plush/dinosaur.png') },
  { id: 'ladybug', name: '憨弟弟', color: '#FFF0ED', image: require('../../assets/mascots/real-plush/ladybug.png') },
  { id: 'butterfly', name: '憨妹妹', color: '#F2EDF8', image: require('../../assets/mascots/real-plush/butterfly.png') },
  { id: 'cow', name: '憨姐姐', color: '#F2F3EF', image: require('../../assets/mascots/real-plush/cow.png') },
  { id: 'bee', name: '憨轩轩', color: '#FFF5CE', image: require('../../assets/mascots/real-plush/bee.png') },
  { id: 'bunny', name: '憨悦悦', color: '#FFF0F3', image: require('../../assets/mascots/real-plush/bunny.png') },
] as const;

export function getMascot(id: MascotId) {
  return mascots.find((item) => item.id === id) ?? mascots[0];
}
