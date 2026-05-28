# PhosFate Runtime

\`Run PhosFate\` needs a Python inference environment plus the external \`fpocket\`
binary.

Local setup used during development:

\`\`\`bash
cd /Users/rizapd/Documents/Work/PhosFate
python3.11 -m venv .venv-phosfate
source .venv-phosfate/bin/activate
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r backend/requirements-phosfate.txt
\`\`\`

System binary:

\`\`\`bash
fpocket -h
\`\`\`

If \`fpocket\` is not available from the system package manager, build it from
source and put its \`bin/fpocket\` on \`PATH\`.

On Apple Silicon macOS:

\`\`\`bash
curl -L https://github.com/Discngine/fpocket/archive/refs/heads/master.tar.gz -o /tmp/fpocket.tar.gz
rm -rf /tmp/fpocket-build
mkdir -p /tmp/fpocket-build
tar -xzf /tmp/fpocket.tar.gz -C /tmp/fpocket-build --strip-components=1
cd /tmp/fpocket-build
make ARCH=MACOSXARM64
mkdir -p ~/.local/bin
cp bin/fpocket ~/.local/bin/fpocket
ln -sf ~/.local/bin/fpocket /opt/homebrew/bin/fpocket
\`\`\`

The classifier files expected by the backend are:

\`\`\`text
Results/results_mlp_BW_hparam_sweep/best_model_20260320-103259/metadata.json
Results/results_mlp_BW_hparam_sweep/best_model_20260320-103259/mlp_state_dict.pt
\`\`\`

The runtime will also download/cache model weights for \`facebook/esmfold_v1\`
and \`esm2_t33_650M_UR50D\` when inference first runs.

Backend endpoint:

\`\`\`text
POST /api/phosfate/run
\`\`\`

JSON body:

\`\`\`json
{
  "jobName": "9SV1_1",
  "sequence": "MSKVC...",
  "topK": 5,
  "distance": 5.0
}
\`\`\`

Useful deployment overrides:

\`\`\`bash
PHOSFATE_PYTHON=/path/to/python
PHOSFATE_RUNNER=/path/to/phosfate_runner.py
PHOSFATE_MODEL_DIR=/path/to/best_model_20260320-103259
PHOSFATE_RUNS_DIR=/path/to/phosfate_runs
PHOSFATE_TIMEOUT_MS=3600000
PHOSFATE_MAX_SEQUENCE_LENGTH=1023
\`\`\`
