// Generated from tokens.json (Contour 0.1.0) by scripts/build-tokens.mjs. Do not edit by hand.
//
// Every number is in scene units: metres (m), radians (rad), seconds (s), or
// unitless. Tokens in dmm are "metres at 1 m away": scale them with
// atDistance(value, distanceM). units[name] says which tokens those are.

export const version = "0.1.0";

export const tokens = {
  "material": {
    "t": {
      "thin": 0.004,
      "regular": 0.008,
      "thick": 0.016
    },
    "density": {
      "soft": {
        "press": 0.6,
        "recover": 0.22
      },
      "firm": {
        "press": 0.4,
        "recover": 0.14
      },
      "rigid": {
        "press": 0.15,
        "recover": 0.08
      }
    }
  },
  "proximity": {
    "hover": {
      "enter": 0.1,
      "exit": 0.14
    },
    "poke": {
      "press": "surface-contact",
      "release": 0.003
    },
    "nearfar": {
      "threshold": 0.35,
      "hysteresis": 0.05
    }
  },
  "dock": {
    "magnify": {
      "radius": 0.25,
      "scale": {
        "max": 1.6
      },
      "falloff": "cosine"
    }
  },
  "size": {
    "target": {
      "min": 0.048,
      "floor": 0.022
    },
    "button": {
      "default": 0.06
    },
    "gap": {
      "min": 0.016
    }
  },
  "menu": {
    "extent": {
      "vertical": {
        "max": 0.610865238198
      }
    }
  },
  "motion": {
    "hover": {
      "in": {
        "duration": 0.12,
        "easing": [
          0,
          0,
          0.58,
          1
        ]
      }
    },
    "press": {
      "down": "follow-input"
    },
    "expand": {
      "dropdown": {
        "duration": 0.24,
        "easing": [
          0.42,
          0,
          0.58,
          1
        ]
      }
    },
    "recover": "inherit:material.density"
  },
  "anchor": {
    "mode": "body-lock",
    "follow": {
      "delay": 0.35,
      "damping": "critical",
      "frequency": 6
    },
    "eccentricity": {
      "vertical": -0.436332312999
    },
    "hand": {
      "scale": "physical"
    },
    "surface": {
      "scale": "freeze-on-place"
    },
    "body": {
      "scale": "track-distance"
    },
    "world": {
      "scale": "freeze-on-place",
      "growth": {
        "knee": 1.75,
        "rate": 0.5
      }
    }
  },
  "feedback": {
    "detent": {
      "interval": 0.1,
      "audio": {
        "gain": -18,
        "length": 0.03
      }
    },
    "shadow": {
      "press": {
        "curve": "proportional-to-push",
        "scale": 0.9,
        "opacity": {
          "min": 0.15,
          "max": 0.6
        }
      }
    },
    "glow": {
      "edge": 0.0015
    }
  },
  "surface": {
    "opacity": {
      "base": 0.92
    },
    "contrast": {
      "min": 3
    },
    "scrim": {
      "min": 0,
      "max": 0.35
    },
    "outline": {
      "mr": 0.001
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
  },
  "zslider": {
    "travel": 0.07
  }
};

/** Scene unit of each dimension or duration token: m, m@1m (dmm), rad or s. */
export const units = {
  "material.t.thin": "m",
  "material.t.regular": "m",
  "material.t.thick": "m",
  "material.density.soft.recover": "s",
  "material.density.firm.recover": "s",
  "material.density.rigid.recover": "s",
  "proximity.hover.enter": "m@1m",
  "proximity.hover.exit": "m@1m",
  "proximity.poke.release": "m",
  "proximity.nearfar.threshold": "m",
  "proximity.nearfar.hysteresis": "m",
  "dock.magnify.radius": "m@1m",
  "size.target.min": "m@1m",
  "size.target.floor": "m",
  "size.button.default": "m@1m",
  "size.gap.min": "m@1m",
  "menu.extent.vertical.max": "rad",
  "motion.hover.in.duration": "s",
  "motion.expand.dropdown.duration": "s",
  "anchor.follow.delay": "s",
  "anchor.eccentricity.vertical": "rad",
  "anchor.world.growth.knee": "m",
  "feedback.detent.audio.length": "s",
  "feedback.glow.edge": "m@1m",
  "surface.outline.mr": "m@1m",
  "packaging.parent.recede.z": "m",
  "packaging.parent.recede.y": "m",
  "zslider.travel": "m"
};

/** Tokens that are not decisions yet (status: provisional in tokens.json). */
export const provisional = [
  "size.target.floor",
  "anchor.follow.frequency",
  "anchor.hand.scale",
  "anchor.surface.scale",
  "anchor.body.scale",
  "anchor.world.scale",
  "anchor.world.growth.knee",
  "anchor.world.growth.rate",
  "feedback.detent.audio.length",
  "feedback.shadow.press.scale",
  "feedback.shadow.press.opacity.min",
  "feedback.shadow.press.opacity.max",
  "packaging.depth.max",
  "packaging.parent.mode",
  "packaging.parent.recede.z",
  "packaging.parent.recede.y",
  "packaging.parent.recede.scale",
  "packaging.parent.recede.opacity.start",
  "packaging.parent.recede.opacity.step",
  "packaging.parent.recede.opacity.min",
  "zslider.travel"
];

/** Turns a dmm token (metres at 1 m) into metres at the real placement distance. */
export const atDistance = (value, distanceM) => value * distanceM;

export default tokens;
