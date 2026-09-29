export interface Flour {
  id: string
  name: string
  where: string
  protein: number // g per 100 g, as printed on typical packs
  w?: number // rough manufacturer figure, only where one is published
}

// Approximate values. Check the pack: protein is always printed, W almost never is on Polish flours.
export const FLOURS: Flour[] = [
  { id: 'caputo-cuoco', name: 'Caputo Cuoco', where: 'Imported, specialist shops and online', protein: 13, w: 300 },
  { id: 'caputo-pizzeria', name: 'Caputo Pizzeria 00 (blue)', where: 'Imported, online and some supermarkets', protein: 12.5, w: 260 },
  { id: 'manitoba', name: 'Manitoba (Caputo Oro, Casillo)', where: 'Strong flour, best blended or for long rises', protein: 14, w: 350 },
  { id: 'w250', name: 'Bongiovanni Pizza W250', where: 'Online', protein: 12, w: 250 },
  { id: 'il-molino', name: 'Il Molino, Divella or Casillo Pizza 00', where: 'Cheaper Italian 00, sold in larger supermarkets', protein: 11.5 },
  { id: 'pl-750', name: 'Polish wheat flour type 750', where: 'Any supermarket', protein: 11.5 },
  { id: 'pl-650', name: 'Polish wheat flour type 650', where: 'Any supermarket', protein: 11 },
  { id: 'pl-550', name: 'Polish wheat flour type 550', where: 'Any supermarket', protein: 10.5 },
  { id: 'pl-450', name: 'Polish wheat flour type 450 (tortowa)', where: 'Any supermarket', protein: 9.5 },
]
