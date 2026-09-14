import math

class ECGSynth:
    def __init__(self):
        self.x = 1.0
        self.y = 0.0
        self.z = 0.0
        # P, Q, R, S, T waves
        self.a = [1.2, -5.0, 30.0, -7.5, 0.75]
        self.b = [0.25, 0.1, 0.1, 0.1, 0.4]
        self.theta = [-math.pi/3, -math.pi/12, 0.0, math.pi/12, math.pi/2]

    def sample(self, hr: float, dt: float) -> float:
        # Bazett's correction (QTc = QT / sqrt(RR))
        rr = 60.0 / hr if hr > 0 else 1.0
        sqrt_rr = math.sqrt(rr)
        
        b_adjusted = list(self.b)
        b_adjusted[4] = self.b[4] * sqrt_rr
        
        omega = 2 * math.pi * hr / 60.0
        r_sq = self.x**2 + self.y**2
        alpha = 1.0 - math.sqrt(r_sq)
        
        dx = alpha * self.x - omega * self.y
        dy = alpha * self.y + omega * self.x
        
        theta_current = math.atan2(self.y, self.x)
        
        z_sum = 0.0
        for i in range(5):
            d_theta = (theta_current - self.theta[i])
            d_theta = (d_theta + math.pi) % (2 * math.pi) - math.pi
            z_sum += self.a[i] * d_theta * math.exp(-0.5 * (d_theta**2) / (b_adjusted[i]**2))
            
        dz = -z_sum - self.z
        
        self.x += dx * dt
        self.y += dy * dt
        self.z += dz * dt
        
        return self.z
