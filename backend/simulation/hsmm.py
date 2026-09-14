import random
import math
from enum import Enum

class HSMMState(Enum):
    RESTING = 0
    LIGHT_ACTIVITY = 1
    PSYCHOLOGICAL_STRESS = 2
    PHYSICAL_EXERTION = 3
    SLEEP = 4

class HSMM:
    def __init__(self, patient_id: str):
        self.rng = random.Random(hash(patient_id))
        self.current_state = HSMMState.RESTING
        self.time_in_state = 0.0
        
        # (mu, sigma) for log-normal dwell times in seconds
        self.dwell_params = {
            HSMMState.RESTING: (math.log(1800), 0.5), # ~30 mins
            HSMMState.LIGHT_ACTIVITY: (math.log(600), 0.5), # ~10 mins
            HSMMState.PSYCHOLOGICAL_STRESS: (math.log(120), 0.4), # ~2 mins
            HSMMState.PHYSICAL_EXERTION: (math.log(600), 0.5), # ~10 mins
            HSMMState.SLEEP: (math.log(28800), 0.1), # ~8 hours
        }
        
        self.dwell_time = self._sample_dwell_time(self.current_state)
        
        # Base transition matrix (row-stochastic, diag=0)
        self.base_transition = {
            HSMMState.RESTING: {
                HSMMState.LIGHT_ACTIVITY: 0.6,
                HSMMState.PSYCHOLOGICAL_STRESS: 0.2,
                HSMMState.PHYSICAL_EXERTION: 0.1,
                HSMMState.SLEEP: 0.1
            },
            HSMMState.LIGHT_ACTIVITY: {
                HSMMState.RESTING: 0.7,
                HSMMState.PSYCHOLOGICAL_STRESS: 0.1,
                HSMMState.PHYSICAL_EXERTION: 0.2,
                HSMMState.SLEEP: 0.0
            },
            HSMMState.PSYCHOLOGICAL_STRESS: {
                HSMMState.RESTING: 0.8,
                HSMMState.LIGHT_ACTIVITY: 0.2,
                HSMMState.PHYSICAL_EXERTION: 0.0,
                HSMMState.SLEEP: 0.0
            },
            HSMMState.PHYSICAL_EXERTION: {
                HSMMState.RESTING: 0.5,
                HSMMState.LIGHT_ACTIVITY: 0.5,
                HSMMState.PSYCHOLOGICAL_STRESS: 0.0,
                HSMMState.SLEEP: 0.0
            },
            HSMMState.SLEEP: {
                HSMMState.RESTING: 1.0,
                HSMMState.LIGHT_ACTIVITY: 0.0,
                HSMMState.PSYCHOLOGICAL_STRESS: 0.0,
                HSMMState.PHYSICAL_EXERTION: 0.0
            }
        }

    def _sample_dwell_time(self, state: HSMMState) -> float:
        mu, sigma = self.dwell_params.get(state, (math.log(60), 0.1))
        return self.rng.lognormvariate(mu, sigma)

    def step(self, dt: float, hmm_state: int) -> HSMMState:
        self.time_in_state += dt
        if self.time_in_state >= self.dwell_time:
            self.time_in_state = 0.0
            
            probs = dict(self.base_transition[self.current_state])
            
            # HMM bias: if volatile/burnout (hmm_state == 2), scale up stress prob
            if hmm_state == 2 and HSMMState.PSYCHOLOGICAL_STRESS in probs:
                probs[HSMMState.PSYCHOLOGICAL_STRESS] *= 3.0
            
            total = sum(probs.values())
            if total > 0:
                for k in probs:
                    probs[k] /= total
            
            r = self.rng.random()
            cum = 0.0
            for state, p in probs.items():
                cum += p
                if r <= cum:
                    self.current_state = state
                    break
                    
            self.dwell_time = self._sample_dwell_time(self.current_state)
            
        return self.current_state
