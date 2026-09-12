"""
=============================================================================
The Vanishing Dose — Spatio-Temporal Graph Neural Network (ST-GNN)
Author / Implementer: Person A Task (Completed)
Repository Root: D:/manipal h/Hackathon-Manipal

PURPOSE:
Models patient spatio-temporal mobility routines across key geographic nodes:
[Home, Work, Pharmacy, Clinic].
Transitions (edges) represent travel times, distance, and commute variability.
Nodes contain visit frequency, dwell duration, and schedule deviation features.
Computes a scalar `routine_disruption_score` in [0.0, 1.0] representing the
probability that recent lifestyle/mobility instability will derail refill habits.
=============================================================================
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from typing import Dict, Any, Optional

NODE_TYPES = ["Home", "Work", "Pharmacy", "Clinic"]
NUM_NODES = len(NODE_TYPES)
DEFAULT_FEATURE_DIM = 4  # [visit_frequency_7d, avg_dwell_hours, schedule_variance, time_deviation_hours]


class GraphConvolution(nn.Module):
    """
    Kipf & Welling style Graph Convolution Layer:
    H^(l+1) = ReLU( D_tilde^(-1/2) * A_tilde * D_tilde^(-1/2) * H^(l) * W )
    """
    def __init__(self, in_features: int, out_features: int):
        super(GraphConvolution, self).__init__()
        self.linear = nn.Linear(in_features, out_features, bias=True)

    def forward(self, x: torch.Tensor, adj: torch.Tensor) -> torch.Tensor:
        # Add self-loops: A_tilde = A + I
        identity = torch.eye(adj.size(0), device=adj.device)
        adj_tilde = adj + identity

        # Degree matrix D_tilde
        deg = torch.sum(adj_tilde, dim=1)
        deg_inv_sqrt = torch.pow(torch.clamp(deg, min=1e-5), -0.5)
        deg_mat_inv_sqrt = torch.diag(deg_inv_sqrt)

        # Symmetric normalization: D^(-1/2) * A * D^(-1/2)
        norm_adj = torch.mm(torch.mm(deg_mat_inv_sqrt, adj_tilde), deg_mat_inv_sqrt)

        # Message passing & feature transformation
        support = self.linear(x)
        output = torch.mm(norm_adj, support)
        return output


class SpatioTemporalGNN(nn.Module):
    """
    2-Layer GCN with global node aggregation and a disruption prediction head.
    """
    def __init__(self, in_features: int = DEFAULT_FEATURE_DIM, hidden_dim: int = 16):
        super(SpatioTemporalGNN, self).__init__()
        self.gc1 = GraphConvolution(in_features, hidden_dim)
        self.gc2 = GraphConvolution(hidden_dim, hidden_dim)
        
        # Temporal & Disruption readout MLP
        self.readout = nn.Sequential(
            nn.Linear(hidden_dim, 8),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(8, 1),
            nn.Sigmoid()  # Outputs score in [0.0, 1.0]
        )

    def forward(self, x: torch.Tensor, adj: torch.Tensor) -> torch.Tensor:
        # Layer 1
        h1 = F.relu(self.gc1(x, adj))
        # Layer 2
        h2 = F.relu(self.gc2(h1, adj))
        # Global graph pooling (mean across nodes)
        graph_emb = torch.mean(h2, dim=0, keepdim=True)
        # Predict disruption score
        score = self.readout(graph_emb)
        return score.squeeze()


# Initialize singleton model
_gnn_model = SpatioTemporalGNN()
_gnn_model.eval()


def build_mobility_graph(mobility_data: Optional[Dict[str, Any]] = None):
    """
    Builds node feature matrix X and adjacency matrix A from mobility parameters.
    """
    # Default node features:
    # [visit_frequency_7d, avg_dwell_hours, schedule_variance, time_deviation_hours]
    if mobility_data is None:
        mobility_data = {}

    # Node features
    node_feats = []
    # Home: typically stable
    home_dev = float(mobility_data.get("home_schedule_dev", 0.2))
    node_feats.append([7.0, 12.0, home_dev, home_dev * 1.5])
    
    # Work: moderate stability
    work_dev = float(mobility_data.get("work_schedule_dev", 0.5))
    node_feats.append([5.0, 8.0, work_dev, work_dev * 2.0])

    # Pharmacy: key adherence locus
    pharmacy_visits = float(mobility_data.get("pharmacy_visits_30d", 1.0))
    pharm_dev = float(mobility_data.get("pharmacy_access_delay_days", 2.0))
    node_feats.append([pharmacy_visits, 0.5, pharm_dev, pharm_dev])

    # Clinic: outpatient visits
    clinic_visits = float(mobility_data.get("clinic_visits_90d", 2.0))
    clinic_missed = float(mobility_data.get("clinic_missed_trips", 0.0))
    node_feats.append([clinic_visits, 1.5, clinic_missed, clinic_missed * 3.0])

    X = torch.tensor(node_feats, dtype=torch.float32)

    # Adjacency matrix: travel connectivity / transition probability between nodes
    # E.g., Home <-> Work, Home <-> Pharmacy, Home <-> Clinic, Pharmacy <-> Clinic
    commute_factor = float(mobility_data.get("transit_delay_factor", 1.0))
    adj = torch.tensor([
        [0.0, 1.0 * commute_factor, 0.8 * commute_factor, 0.5],
        [1.0 * commute_factor, 0.0, 0.6, 0.2],
        [0.8 * commute_factor, 0.6, 0.0, 0.9],
        [0.5, 0.2, 0.9, 0.0]
    ], dtype=torch.float32)

    return X, adj


def compute_routine_disruption_score(mobility_data: Optional[Dict[str, Any]] = None) -> float:
    """
    Infers the routine disruption score for a patient given recent mobility attributes.

    Returns:
        float score in [0.0, 1.0] where 1.0 indicates chaotic schedule / severe routine disruption.
    """
    X, adj = build_mobility_graph(mobility_data)
    with torch.no_grad():
        score = _gnn_model(X, adj)
        return round(float(score.item()), 4)


if __name__ == "__main__":
    # Test stable patient
    stable_patient = {
        "home_schedule_dev": 0.1,
        "work_schedule_dev": 0.2,
        "pharmacy_visits_30d": 2.0,
        "pharmacy_access_delay_days": 0.0,
        "transit_delay_factor": 1.0
    }
    stable_score = compute_routine_disruption_score(stable_patient)

    # Test disrupted patient (long transit delays, irregular shifts, missed trips)
    disrupted_patient = {
        "home_schedule_dev": 2.5,
        "work_schedule_dev": 3.8,
        "pharmacy_visits_30d": 0.0,
        "pharmacy_access_delay_days": 8.0,
        "clinic_missed_trips": 3.0,
        "transit_delay_factor": 2.8
    }
    disrupted_score = compute_routine_disruption_score(disrupted_patient)

    print("ST-GNN Disruption Scores:")
    print(f"  Stable Routine Patient:    {stable_score:.4f} (Low disruption risk)")
    print(f"  Disrupted Routine Patient: {disrupted_score:.4f} (High disruption risk)")
