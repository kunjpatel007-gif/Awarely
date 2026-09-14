import math

class CircadianModel:
    def __init__(self, mesor: float):
        self.mesor = mesor
        self.a1 = 7.5 # 5-10 BPM
        self.a2 = 2.0 # ultradian harmonic
        self.phi1 = 14.0 # peak at 14:00 (2pm)
        self.phi2 = 2.0
    
    def hr_at(self, t_seconds: float) -> float:
        hours = (t_seconds / 3600.0) % 24.0
        # 24h primary component
        hr = self.mesor + self.a1 * math.cos(2 * math.pi * (hours - self.phi1) / 24.0)
        # 12h ultradian harmonic
        hr += self.a2 * math.cos(2 * math.pi * (hours - self.phi2) / 12.0)
        return hr
