# 6. Ventilation and Stagnation

Two provinces can emit the same amount of smoke and end the day with wildly different air. The difference is ventilation — the atmosphere's capacity to dilute and remove what is emitted into it. AirDash encodes this as the **stagnation sub-score**, worth 15% of the Air Watch Score, and this chapter explains the meteorology behind it.

## 6.1 The ventilation idea

Think of the air over a city as a box. Its floor is the ground; its lid is the **mixing height**, the altitude up to which surface air convects and mixes freely; its side walls are opened by **wind**, which carries the box's contents away and replaces them with cleaner air. The product of wind speed and mixing height is often called the ventilation coefficient: a deep, breezy box dilutes emissions enormously, while a shallow, still one concentrates them. Concentration is emissions divided by ventilation — so halving ventilation does to the air what doubling every source would do.

## 6.2 Calm plus dry equals accumulation

The dangerous pattern is the combination. On clear cool-season nights the ground chills, a surface inversion caps the box at rooftop height, and morning traffic plus overnight burning pours into a lid-locked layer — which is why haze mornings look and measure worst before the afternoon sun lifts the mixing height. If wind stays weak, each day starts where the last left off. And if no rain is coming, the one process that could reset the accumulation — washout — is absent too. Calm, dry, and cool is the recipe for a multi-day episode even without any increase in burning.

## 6.3 The stagnation sub-score

The engine builds the sub-score from the province's forecast wind and rain chance:

```
wind < 8 km/h → 70 · < 12 → 45 · < 16 → 20 · else 0
+30 if rain probability (24 h) < 20% · +15 if < 40%
forced to 0 if observed rain in the last 24 h exceeds 10 mm
```

The wind term reads dispersion capacity; the rain-probability term reads whether washout relief is plausible; and observed heavy rain zeroes the whole thing, because an atmosphere that is actively washing itself is by definition not stagnant. The result is clamped to 0–100. It is deliberately a *proxy*: AirDash does not model mixing height directly — radiosonde-grade data is not available per province in real time — so forecast surface wind and rain chance stand in for the full ventilation picture. The proxy earns its 15% weight by being the component that explains why identical emissions hurt more in January than in July.
