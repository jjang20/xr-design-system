// Generated from tokens.json (Contour 0.2.0) by scripts/build-tokens.mjs. Do not edit by hand.
//
// Every number is in scene units: metres (m), radians (rad), seconds (s), or
// unitless. Tokens in vpt are "metres at 1 m away": scale them with
// viewSize(value, distanceM). units[name] says which tokens those are.

export const version = "0.2.0";

export const tokens = {
  "thickness": {
    "100": 0.004,
    "200": 0.008,
    "400": 0.016
  },
  "size": {
    "1600": 0.048,
    "2000": 0.06,
    "interactive": {
      "minimum": 0.048,
      "default": 0.06
    }
  },
  "spacing": {
    "600": 0.018,
    "gap": {
      "minimum": 0.018
    }
  },
  "duration": {
    "120": 0.12,
    "140": 0.14,
    "220": 0.22,
    "240": 0.24,
    "030": 0.03,
    "080": 0.08
  },
  "easing": {
    "easeOut": [
      0,
      0,
      0.58,
      1
    ],
    "easeInOut": [
      0.42,
      0,
      0.58,
      1
    ]
  },
  "distance": {
    "100": 0.1,
    "140": 0.14,
    "350": 0.35,
    "400": 0.4,
    "003": 0.003
  },
  "material": {
    "thickness": {
      "thin": 0.004,
      "regular": 0.008,
      "thick": 0.016
    },
    "firmness": {
      "soft": {
        "pressDepth": 0.6
      },
      "firm": {
        "pressDepth": 0.4
      },
      "rigid": {
        "pressDepth": 0.15
      }
    },
    "opacity": {
      "default": 0.92
    },
    "outline": {
      "width": 0.00075
    },
    "glow": {
      "width": 0.0015
    }
  },
  "motion": {
    "enter": {
      "duration": 0.12,
      "easing": [
        0,
        0,
        0.58,
        1
      ]
    },
    "expand": {
      "duration": 0.24,
      "easing": [
        0.42,
        0,
        0.58,
        1
      ]
    },
    "recovery": {
      "soft": {
        "duration": 0.22
      },
      "firm": {
        "duration": 0.14
      },
      "rigid": {
        "duration": 0.08
      }
    },
    "press": {
      "behavior": "followInput"
    }
  },
  "color": {
    "contrast": {
      "ratio": {
        "minimum": 3
      }
    },
    "scrim": {
      "opacity": {
        "minimum": 0,
        "maximum": 0.35
      }
    }
  },
  "shadow": {
    "contact": {
      "behavior": "proportionalToPush",
      "scaleGain": 0.9,
      "opacity": {
        "minimum": 0.15,
        "maximum": 0.6
      }
    }
  },
  "sound": {
    "detent": {
      "gain": -18,
      "duration": 0.03
    }
  },
  "input": {
    "hover": {
      "distance": {
        "enter": 0.1,
        "exit": 0.14
      }
    },
    "poke": {
      "pressTrigger": "surfaceContact",
      "distance": {
        "release": 0.003
      }
    },
    "direct": {
      "distance": {
        "enter": 0.35,
        "exit": 0.4
      }
    },
    "touch": {
      "size": {
        "minimum": 0.022
      }
    }
  },
  "zone": {
    "room": {
      "growth": {
        "start": 1.75,
        "rate": 0.5
      }
    }
  },
  "anchor": {
    "mode": "bodyLock",
    "follow": {
      "delay": 0.35,
      "damping": "critical",
      "frequency": 6
    },
    "eccentricity": {
      "vertical": -0.436332312999
    }
  },
  "dock": {
    "magnify": {
      "radius": 0.249,
      "scale": {
        "max": 1.6
      },
      "falloff": "cosine"
    }
  },
  "menu": {
    "extent": {
      "vertical": {
        "max": 0.610865238198
      }
    }
  },
  "zslider": {
    "travel": 0.07
  },
  "feedback": {
    "detent": {
      "interval": 0.1
    }
  },
  "packaging": {
    "depth": {
      "max": 3
    },
    "parent": {
      "mode": "compress",
      "recede": {
        "z": 0.05,
        "y": 0.035,
        "scale": 0.08,
        "opacity": {
          "start": 0.6,
          "step": 0.14,
          "min": 0.3
        }
      }
    }
  }
};

/** Scene unit of each dimension or duration token: m, m@1m (vpt), rad or s. */
export const units = {
  "thickness.100": "m",
  "thickness.200": "m",
  "thickness.400": "m",
  "size.1600": "m@1m",
  "size.2000": "m@1m",
  "size.interactive.minimum": "m@1m",
  "size.interactive.default": "m@1m",
  "spacing.600": "m@1m",
  "spacing.gap.minimum": "m@1m",
  "duration.120": "s",
  "duration.140": "s",
  "duration.220": "s",
  "duration.240": "s",
  "duration.030": "s",
  "duration.080": "s",
  "distance.100": "m",
  "distance.140": "m",
  "distance.350": "m",
  "distance.400": "m",
  "distance.003": "m",
  "material.thickness.thin": "m",
  "material.thickness.regular": "m",
  "material.thickness.thick": "m",
  "material.outline.width": "m@1m",
  "material.glow.width": "m@1m",
  "motion.enter.duration": "s",
  "motion.expand.duration": "s",
  "motion.recovery.soft.duration": "s",
  "motion.recovery.firm.duration": "s",
  "motion.recovery.rigid.duration": "s",
  "sound.detent.duration": "s",
  "input.hover.distance.enter": "m",
  "input.hover.distance.exit": "m",
  "input.poke.distance.release": "m",
  "input.direct.distance.enter": "m",
  "input.direct.distance.exit": "m",
  "input.touch.size.minimum": "m",
  "zone.room.growth.start": "m",
  "anchor.follow.delay": "s",
  "anchor.eccentricity.vertical": "rad",
  "dock.magnify.radius": "m@1m",
  "menu.extent.vertical.max": "rad",
  "zslider.travel": "m",
  "packaging.parent.recede.z": "m",
  "packaging.parent.recede.y": "m"
};

/** Tokens that are not decisions yet (status: provisional in tokens.json). */
export const provisional = [
  "shadow.contact.scaleGain",
  "shadow.contact.opacity.minimum",
  "shadow.contact.opacity.maximum",
  "sound.detent.duration",
  "input.touch.size.minimum",
  "zone.room.growth.start",
  "zone.room.growth.rate",
  "anchor.follow.frequency",
  "zslider.travel",
  "packaging.depth.max",
  "packaging.parent.mode",
  "packaging.parent.recede.z",
  "packaging.parent.recede.y",
  "packaging.parent.recede.scale",
  "packaging.parent.recede.opacity.start",
  "packaging.parent.recede.opacity.step",
  "packaging.parent.recede.opacity.min"
];

/** Old token names (v0.1) and their new names; null means removed. */
export const renamed = {
  "material.t.thin": "material.thickness.thin",
  "material.t.regular": "material.thickness.regular",
  "material.t.thick": "material.thickness.thick",
  "material.density.soft.press": "material.firmness.soft.pressDepth",
  "material.density.firm.press": "material.firmness.firm.pressDepth",
  "material.density.rigid.press": "material.firmness.rigid.pressDepth",
  "surface.opacity.base": "material.opacity.default",
  "surface.outline.mr": "material.outline.width",
  "feedback.glow.edge": "material.glow.width",
  "motion.hover.in.duration": "motion.enter.duration",
  "motion.hover.in.easing": "motion.enter.easing",
  "motion.expand.dropdown.duration": "motion.expand.duration",
  "motion.expand.dropdown.easing": "motion.expand.easing",
  "material.density.soft.recover": "motion.recovery.soft.duration",
  "material.density.firm.recover": "motion.recovery.firm.duration",
  "material.density.rigid.recover": "motion.recovery.rigid.duration",
  "motion.press.down": "motion.press.behavior",
  "motion.recover": null,
  "size.target.min": "size.interactive.minimum",
  "size.button.default": "size.interactive.default",
  "size.gap.min": "spacing.gap.minimum",
  "surface.contrast.min": "color.contrast.ratio.minimum",
  "surface.scrim.min": "color.scrim.opacity.minimum",
  "surface.scrim.max": "color.scrim.opacity.maximum",
  "feedback.shadow.press.curve": "shadow.contact.behavior",
  "feedback.shadow.press.scale": "shadow.contact.scaleGain",
  "feedback.shadow.press.opacity.min": "shadow.contact.opacity.minimum",
  "feedback.shadow.press.opacity.max": "shadow.contact.opacity.maximum",
  "feedback.detent.audio.gain": "sound.detent.gain",
  "feedback.detent.audio.length": "sound.detent.duration",
  "proximity.hover.enter": "input.hover.distance.enter",
  "proximity.hover.exit": "input.hover.distance.exit",
  "proximity.poke.press": "input.poke.pressTrigger",
  "proximity.poke.release": "input.poke.distance.release",
  "proximity.nearfar.threshold": "input.direct.distance.enter",
  "proximity.nearfar.hysteresis": "input.direct.distance.exit",
  "size.target.floor": "input.touch.size.minimum",
  "anchor.world.growth.knee": "zone.room.growth.start",
  "anchor.world.growth.rate": "zone.room.growth.rate",
  "anchor.hand.scale": null,
  "anchor.surface.scale": null,
  "anchor.body.scale": null,
  "anchor.world.scale": null
};

/** f(d): the distance the vpt formula uses. 1:1 up to zone.room.growth.start, then slower. */
export const effectiveDistance = (distanceM) => {
  const start = tokens.zone.room.growth.start, rate = tokens.zone.room.growth.rate;
  return distanceM <= start ? distanceM : start + rate * (distanceM - start);
};

/**
 * Real size in metres of a vpt token for a panel placed distanceM away.
 * Measure distanceM once, when the panel is placed, not every frame.
 */
export const viewSize = (value, distanceM) => value * effectiveDistance(distanceM);

/** Hit size of a touch target: its view size, but never under the fingertip floor. */
export const touchSize = (value, distanceM) =>
  Math.max(viewSize(value, distanceM), tokens.input.touch.size.minimum);

export default tokens;
