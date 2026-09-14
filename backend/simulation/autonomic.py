class AutonomicModel:
    def __init__(self):
        self.tau_p = 1.2 # Parasympathetic withdrawal (fast)
        self.tau_s = 6.0 # Sympathetic activation/recovery (slow)
        
    def step(self, current_hr: float, target_hr: float, dt: float, hsmm_state) -> float:
        diff = target_hr - current_hr
        # Use tau_p for fast increases (e.g. going into stress/exertion)
        # Use tau_s for slow decreases (e.g. recovering to rest)
        tau = self.tau_p if diff > 0 else self.tau_s
            
        dhr_dt = (target_hr - current_hr) / tau
        # Enforce maximum physiological acceleration limit
        dhr_dt = max(-5.0, min(5.0, dhr_dt))
        return current_hr + dhr_dt * dt
