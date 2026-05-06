/**
 * Heatmap Visual Configuration
 * System uses relative normalization: 0.0 (Quiet) to 1.0 (Busy).
 */

export const HEATMAP_COLORS = {
  EMPTY: '#FFFFFF',    // Quiet (White)
  LEVEL_1: '#C8F7C5',  // Low (Light Green)
  LEVEL_2: '#7ED957',  // Active (Green)
  LEVEL_3: '#2ECC71',  // Busy (Darker Green)
  LEVEL_4: '#006400',  // Peak (Darkest Green)
};

export const HEATMAP_THRESHOLDS = {
  LEVEL_1: 1,
  LEVEL_2: 5,
  LEVEL_3: 10,
  LEVEL_4: 20
};
