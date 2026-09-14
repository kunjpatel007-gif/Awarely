import math

class PPGSynth:
    def __init__(self):
        # A, mu (phase [0,1)), sigma (phase width)
        self.a = [1.0, 0.4, 0.3]
        self.mu = [0.2, 0.4, 0.55]
        self.sigma = [0.05, 0.05, 0.08]
        
    def sample(self, hr: float, phase: float, sympathetic_drive: float) -> float:
        # sympathetic_drive in [0, 1] reduces dicrotic notch
        ppg = 0.0
        a_adj = list(self.a)
        a_adj[1] *= max(0.0, 1.0 - sympathetic_drive)
        
        for i in range(3):
            d = phase - self.mu[i]
            if d > 0.5: d -= 1.0
            if d < -0.5: d += 1.0
            ppg += a_adj[i] * math.exp(-(d**2) / (2 * self.sigma[i]**2))
            
        return ppg
