export interface Flour {
  id: string
  name: string
  note?: string // what it suits; left out for generic supermarket flours
  protein: number // g per 100 g, as printed on typical packs
  w?: number // rough manufacturer figure, only where one is published
}

// Approximate values. Check the pack: protein is always printed, W almost never is on Polish flours.
export const FLOURS: Flour[] = [
  { id: 'caputo-cuoco', name: 'Caputo Cuoco', note: 'Strong 00 for 24–48 h doughs. Takes more water than the blue Pizzeria.', protein: 13, w: 300 },
  { id: 'caputo-pizzeria', name: 'Caputo Pizzeria 00 (blue)', note: '00 made for 8–24 h doughs, the usual pick for Neapolitan.', protein: 12.5, w: 260 },
  { id: 'manitoba', name: 'Manitoba (Caputo Oro, Casillo)', note: 'Very strong flour, best blended with a weaker one or for long rises.', protein: 14, w: 350 },
  { id: 'w250', name: 'Bongiovanni Pizza W250', note: 'Mid-strength 00 for same-day and overnight doughs.', protein: 12, w: 250 },
  { id: 'il-molino', name: 'Il Molino, Divella or Casillo Pizza 00', note: 'Mid-strength 00 with no published W, so the calculator estimates W from the protein.', protein: 11.5 },
  { id: 'pl-750', name: 'Polish wheat flour type 750', protein: 11.5 },
  { id: 'pl-650', name: 'Polish wheat flour type 650', protein: 11 },
  { id: 'pl-550', name: 'Polish wheat flour type 550', protein: 10.5 },
  { id: 'pl-450', name: 'Polish wheat flour type 450 (tortowa)', protein: 9.5 },
]
