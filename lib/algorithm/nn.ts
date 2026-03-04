import type { MonthlyReturn, NNModelState } from "@/app/types/algorithm";
import { FEATURE_MONTHS, TRAIN_WINDOW, NN_HIDDEN } from "@/app/types/algorithm";
import { saveNNModel, loadNNModel } from "@/lib/db";

// ─── StandardScaler ──────────────────────────────────────────

export class StandardScaler {
  means: number[] = [];
  stds: number[] = [];

  fit(data: number[][]): void {
    if (data.length === 0) return;
    const nFeatures = data[0].length;
    this.means = new Array(nFeatures).fill(0);
    this.stds = new Array(nFeatures).fill(0);

    for (let f = 0; f < nFeatures; f++) {
      let sum = 0;
      for (const row of data) sum += row[f];
      const mean = sum / data.length;

      let varSum = 0;
      for (const row of data) varSum += (row[f] - mean) ** 2;
      const std = Math.sqrt(varSum / data.length);

      this.means[f] = mean;
      this.stds[f] = std || 1;
    }
  }

  transform(data: number[][]): number[][] {
    return data.map((row) =>
      row.map((val, f) => (val - this.means[f]) / this.stds[f])
    );
  }

  transformSingle(row: number[]): number[] {
    return row.map((val, f) => (val - this.means[f]) / this.stds[f]);
  }
}

// ─── Simple MLP (12 → 20 → 1, sigmoid, Adam) ────────────────

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
}

interface MLPWeights {
  W1: number[][]; // [hidden x input]
  b1: number[]; // [hidden]
  W2: number[]; // [hidden] (single output)
  b2: number; // scalar
}

interface MLPJson {
  W1: number[][];
  b1: number[];
  W2: number[];
  b2: number;
  inputSize: number;
  hiddenSize: number;
}

function initWeights(inputSize: number, hiddenSize: number): MLPWeights {
  // Xavier initialization
  const scale1 = Math.sqrt(2 / (inputSize + hiddenSize));
  const scale2 = Math.sqrt(2 / (hiddenSize + 1));

  const W1: number[][] = [];
  for (let h = 0; h < hiddenSize; h++) {
    const row: number[] = [];
    for (let i = 0; i < inputSize; i++) {
      row.push((Math.random() * 2 - 1) * scale1);
    }
    W1.push(row);
  }

  const b1 = new Array(hiddenSize).fill(0);

  const W2: number[] = [];
  for (let h = 0; h < hiddenSize; h++) {
    W2.push((Math.random() * 2 - 1) * scale2);
  }

  const b2 = 0;

  return { W1, b1, W2, b2 };
}

function forward(
  x: number[],
  w: MLPWeights
): { hidden: number[]; output: number } {
  const hidden: number[] = [];
  for (let h = 0; h < w.W1.length; h++) {
    let sum = w.b1[h];
    for (let i = 0; i < x.length; i++) {
      sum += w.W1[h][i] * x[i];
    }
    hidden.push(sigmoid(sum));
  }

  let outSum = w.b2;
  for (let h = 0; h < hidden.length; h++) {
    outSum += w.W2[h] * hidden[h];
  }

  return { hidden, output: sigmoid(outSum) };
}

function trainMLP(
  X: number[][],
  y: number[],
  hiddenSize: number,
  options: {
    maxIter: number;
    alpha: number; // L2 regularization
    learningRate: number;
    earlyStopFraction: number;
  }
): MLPWeights {
  const inputSize = X[0].length;
  const w = initWeights(inputSize, hiddenSize);

  // Split into train/validation for early stopping
  const nVal = Math.max(1, Math.floor(X.length * options.earlyStopFraction));
  const nTrain = X.length - nVal;
  const indices = Array.from({ length: X.length }, (_, i) => i);

  // Shuffle deterministically (seeded by length)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = (i * 42 + 7) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const trainIdx = indices.slice(0, nTrain);
  const valIdx = indices.slice(nTrain);

  // Adam optimizer state
  const lr = options.learningRate;
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;

  // Moment estimates for W1, b1, W2, b2
  const mW1 = w.W1.map((row) => row.map(() => 0));
  const vW1 = w.W1.map((row) => row.map(() => 0));
  const mb1 = new Array(hiddenSize).fill(0);
  const vb1 = new Array(hiddenSize).fill(0);
  const mW2 = new Array(hiddenSize).fill(0);
  const vW2 = new Array(hiddenSize).fill(0);
  let mb2 = 0;
  let vb2 = 0;

  let bestValLoss = Infinity;
  let patience = 10;
  let patienceCount = 0;

  for (let iter = 0; iter < options.maxIter; iter++) {
    // Accumulate gradients over training set
    const gW1 = w.W1.map((row) => row.map(() => 0));
    const gb1 = new Array(hiddenSize).fill(0);
    const gW2 = new Array(hiddenSize).fill(0);
    let gb2_acc = 0;

    for (const idx of trainIdx) {
      const x = X[idx];
      const target = y[idx];
      const { hidden, output } = forward(x, w);

      // Output error (binary cross-entropy derivative)
      const dOut = output - target;

      // Gradients for W2, b2
      for (let h = 0; h < hiddenSize; h++) {
        gW2[h] += dOut * hidden[h];
      }
      gb2_acc += dOut;

      // Backprop to hidden layer
      for (let h = 0; h < hiddenSize; h++) {
        const dHidden = dOut * w.W2[h] * hidden[h] * (1 - hidden[h]);
        gb1[h] += dHidden;
        for (let i = 0; i < inputSize; i++) {
          gW1[h][i] += dHidden * x[i];
        }
      }
    }

    const t = iter + 1;

    // Average gradients + L2 regularization + Adam update
    for (let h = 0; h < hiddenSize; h++) {
      for (let i = 0; i < inputSize; i++) {
        const g = gW1[h][i] / nTrain + options.alpha * w.W1[h][i];
        mW1[h][i] = beta1 * mW1[h][i] + (1 - beta1) * g;
        vW1[h][i] = beta2 * vW1[h][i] + (1 - beta2) * g * g;
        const mHat = mW1[h][i] / (1 - beta1 ** t);
        const vHat = vW1[h][i] / (1 - beta2 ** t);
        w.W1[h][i] -= lr * mHat / (Math.sqrt(vHat) + eps);
      }

      const gb1g = gb1[h] / nTrain;
      mb1[h] = beta1 * mb1[h] + (1 - beta1) * gb1g;
      vb1[h] = beta2 * vb1[h] + (1 - beta2) * gb1g * gb1g;
      w.b1[h] -= lr * (mb1[h] / (1 - beta1 ** t)) / (Math.sqrt(vb1[h] / (1 - beta2 ** t)) + eps);

      const gW2g = gW2[h] / nTrain + options.alpha * w.W2[h];
      mW2[h] = beta1 * mW2[h] + (1 - beta1) * gW2g;
      vW2[h] = beta2 * vW2[h] + (1 - beta2) * gW2g * gW2g;
      w.W2[h] -= lr * (mW2[h] / (1 - beta1 ** t)) / (Math.sqrt(vW2[h] / (1 - beta2 ** t)) + eps);
    }

    const gb2g = gb2_acc / nTrain;
    mb2 = beta1 * mb2 + (1 - beta1) * gb2g;
    vb2 = beta2 * vb2 + (1 - beta2) * gb2g * gb2g;
    w.b2 -= lr * (mb2 / (1 - beta1 ** t)) / (Math.sqrt(vb2 / (1 - beta2 ** t)) + eps);

    // Early stopping check every 10 iterations
    if (iter % 10 === 0 && valIdx.length > 0) {
      let valLoss = 0;
      for (const idx of valIdx) {
        const { output } = forward(X[idx], w);
        const target = y[idx];
        valLoss -= target * Math.log(output + 1e-10) + (1 - target) * Math.log(1 - output + 1e-10);
      }
      valLoss /= valIdx.length;

      if (valLoss < bestValLoss - 1e-4) {
        bestValLoss = valLoss;
        patienceCount = 0;
      } else {
        patienceCount++;
        if (patienceCount >= patience) break;
      }
    }
  }

  return w;
}

function predict(x: number[], w: MLPWeights): number {
  return forward(x, w).output;
}

// ─── Feature Extraction ──────────────────────────────────────

/**
 * Extract training features from monthly returns (mirrors Python GetFeatures).
 */
export function getFeatures(
  monthlyReturns: MonthlyReturn[]
): {
  X: number[][] | null;
  y: number[] | null;
  latest: number[] | null;
} {
  if (monthlyReturns.length < FEATURE_MONTHS + 2) {
    return { X: null, y: null, latest: null };
  }

  const rets = monthlyReturns.map((r) => r.monthlyReturn);
  const X: number[][] = [];
  const y: number[] = [];

  for (let i = FEATURE_MONTHS; i < rets.length - 1; i++) {
    X.push(rets.slice(i - FEATURE_MONTHS, i));
    y.push(rets[i] > 0 ? 1 : 0);
  }

  const latest =
    rets.length >= FEATURE_MONTHS ? rets.slice(-FEATURE_MONTHS) : null;

  return {
    X: X.length > 0 ? X : null,
    y: y.length > 0 ? y : null,
    latest,
  };
}

// ─── Singleton Model Holder ──────────────────────────────────

const globalForNN = globalThis as typeof globalThis & {
  __nnWeights?: MLPWeights;
  __nnScaler?: StandardScaler;
  __nnTrained?: boolean;
  __nnTrainedAt?: string;
};

export function isNNTrained(): boolean {
  return globalForNN.__nnTrained === true;
}

export function getNNTrainedAt(): string | null {
  return globalForNN.__nnTrainedAt ?? null;
}

// ─── Training ────────────────────────────────────────────────

/**
 * Train the neural network on all symbols' monthly returns.
 * Mirrors the Python TrainNN method.
 */
export function trainNN(
  allMonthlyReturns: Map<string, MonthlyReturn[]>
): boolean {
  const allX: number[][] = [];
  const allY: number[] = [];

  for (const [, monthlyRets] of allMonthlyReturns) {
    const { X, y } = getFeatures(monthlyRets);
    if (!X || !y || X.length < 3) continue;

    // Take last TRAIN_WINDOW samples
    const startIdx = Math.max(0, X.length - TRAIN_WINDOW);
    allX.push(...X.slice(startIdx));
    allY.push(...y.slice(startIdx));
  }

  if (allX.length < 20) {
    console.log(
      `[NN] Not enough training data (${allX.length} samples), skipping`
    );
    return false;
  }

  try {
    // Fit scaler
    const scaler = new StandardScaler();
    scaler.fit(allX);
    const Xs = scaler.transform(allX);

    // Train MLP with Adam optimizer (matches Python: MLPClassifier)
    const weights = trainMLP(Xs, allY, NN_HIDDEN, {
      maxIter: 500,
      alpha: 0.01, // L2 regularization (matches Python)
      learningRate: 0.001,
      earlyStopFraction: 0.15, // matches Python validation_fraction
    });

    // Store in singleton
    globalForNN.__nnWeights = weights;
    globalForNN.__nnScaler = scaler;
    globalForNN.__nnTrained = true;
    globalForNN.__nnTrainedAt = new Date().toISOString();

    // Persist to SQLite
    const modelJson: MLPJson = {
      W1: weights.W1,
      b1: weights.b1,
      W2: weights.W2,
      b2: weights.b2,
      inputSize: FEATURE_MONTHS,
      hiddenSize: NN_HIDDEN,
    };

    const modelState: NNModelState = {
      modelJson: JSON.stringify(modelJson),
      scalerMeans: scaler.means,
      scalerStds: scaler.stds,
      trainedAt: globalForNN.__nnTrainedAt,
      trainingSamples: allX.length,
    };
    saveNNModel(modelState);

    console.log(
      `[NN] Training complete: ${allX.length} samples, ${FEATURE_MONTHS} features, ${NN_HIDDEN} hidden neurons`
    );
    return true;
  } catch (err) {
    console.error("[NN] Training failed:", err);
    return false;
  }
}

/**
 * Load a previously trained model from SQLite.
 */
export function loadPersistedModel(): boolean {
  const state = loadNNModel();
  if (!state) return false;

  try {
    const json: MLPJson = JSON.parse(state.modelJson);
    const weights: MLPWeights = {
      W1: json.W1,
      b1: json.b1,
      W2: json.W2,
      b2: json.b2,
    };

    const scaler = new StandardScaler();
    scaler.means = state.scalerMeans;
    scaler.stds = state.scalerStds;

    globalForNN.__nnWeights = weights;
    globalForNN.__nnScaler = scaler;
    globalForNN.__nnTrained = true;
    globalForNN.__nnTrainedAt = state.trainedAt;

    console.log(
      `[NN] Loaded persisted model (trained at ${state.trainedAt}, ${state.trainingSamples} samples)`
    );
    return true;
  } catch (err) {
    console.error("[NN] Failed to load persisted model:", err);
    return false;
  }
}

// ─── Scoring ─────────────────────────────────────────────────

/**
 * Score a single stock using the hybrid TSMOM + NN approach.
 * Mirrors the Python ScoreStock method.
 */
export function scoreStock(
  monthlyReturns: MonthlyReturn[]
): {
  vanillaMomentum: number;
  nnScore: number;
  combinedScore: number;
} | null {
  if (monthlyReturns.length < FEATURE_MONTHS + 1) return null;

  const rets = monthlyReturns.map((r) => r.monthlyReturn);
  const recentRets = rets.slice(-FEATURE_MONTHS);

  // Vanilla 12-month cumulative return
  const vanillaMomentum =
    recentRets.reduce((acc, r) => acc * (1 + r), 1) - 1;

  // If NN not trained, return vanilla only
  if (
    !globalForNN.__nnTrained ||
    !globalForNN.__nnWeights ||
    !globalForNN.__nnScaler
  ) {
    return {
      vanillaMomentum,
      nnScore: 0.5,
      combinedScore: vanillaMomentum,
    };
  }

  // Get latest features for NN prediction
  const { latest } = getFeatures(monthlyReturns);
  if (!latest) {
    return {
      vanillaMomentum,
      nnScore: 0.5,
      combinedScore: vanillaMomentum,
    };
  }

  try {
    const scaled = globalForNN.__nnScaler.transformSingle(latest);
    const nnProb = predict(scaled, globalForNN.__nnWeights);
    // Map to [-1, 1] range: prob * 2 - 1 (matches Python)
    const nnMapped = nnProb * 2 - 1;

    // Combined: 0.5 * vanilla + 0.5 * nn_score
    const combinedScore = 0.5 * vanillaMomentum + 0.5 * nnMapped;

    return {
      vanillaMomentum,
      nnScore: nnProb, // Store raw probability for display
      combinedScore,
    };
  } catch {
    return {
      vanillaMomentum,
      nnScore: 0.5,
      combinedScore: vanillaMomentum,
    };
  }
}

/**
 * Check if the NN model needs retraining (>28 days since last training).
 */
export function needsRetraining(): boolean {
  if (!globalForNN.__nnTrainedAt) return true;
  const lastTrain = new Date(globalForNN.__nnTrainedAt);
  const now = new Date();
  const daysSince =
    (now.getTime() - lastTrain.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= 28;
}
