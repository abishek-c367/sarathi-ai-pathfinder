import type { Course } from "./course-types";

/**
 * The first "real" backend course. It lives beside the demo courses and is
 * served by the tutor backend through the course service, so the course system
 * supports demo content and backend content at the same time.
 */
export const gpt2Course: Course = {
  id: "gpt2-from-scratch",
  title: "Build GPT-2 from Scratch with PyTorch",
  tagline: "Understand every tensor that turns text into a language model.",
  description:
    "Work up from tokenization and embeddings to causal self-attention, a full transformer block, the training loop and sampling — building GPT-2 in PyTorch one component at a time.",
  difficulty: "advanced",
  status: "published",
  tags: ["PyTorch", "Transformers", "Deep Learning"],
  teaching: { depth: "deep-dive", tone: "encouraging", pacing: "balanced", enforceQuizzes: true },
  modules: [
    {
      id: "foundations",
      title: "Foundations",
      summary: "What a language model actually predicts, and how text becomes tensors.",
      lessons: [
        {
          id: "what-is-a-language-model",
          title: "What is a Language Model?",
          minutes: 12,
          intuition:
            "A language model is a next-token probability machine. Everything else in GPT-2 exists to make that one prediction sharper.",
          objectives: [
            "State what a language model computes, in probability terms",
            "Explain why next-token prediction produces useful general behaviour",
            "Describe autoregressive generation as repeated sampling",
          ],
          concepts: ["Next-token prediction", "Autoregressive model", "Probability distribution"],
          codeExamples: [
            {
              label: "The whole idea in five lines",
              language: "python",
              code: `logits = model(tokens)          # (batch, seq, vocab)
next_logits = logits[:, -1, :]  # only the last position matters
probs = next_logits.softmax(-1)
next_token = torch.multinomial(probs, num_samples=1)
tokens = torch.cat([tokens, next_token], dim=1)`,
            },
          ],
          quiz: [
            {
              id: "gpt2-lm-q1",
              kind: "multiple-choice",
              prompt: "What does a causal language model output for a sequence of n tokens?",
              options: [
                "One label for the whole sequence",
                "A probability distribution over the vocabulary at every position",
                "An embedding vector per token only",
                "The most likely sentence in the training set",
              ],
              answerIndex: 1,
              explanation:
                "Each position gets its own distribution over the vocabulary; generation reads the last one.",
            },
          ],
        },
        {
          id: "tokenization",
          title: "Tokenization",
          minutes: 14,
          intuition:
            "Models never see characters or words — they see integer ids for subword pieces chosen by byte-pair encoding.",
          objectives: [
            "Explain byte-pair encoding as repeated merging of frequent pairs",
            "Convert between text, tokens and ids with a tokenizer",
            "Reason about vocabulary size trade-offs",
          ],
          concepts: ["Byte-pair encoding", "Vocabulary", "Token ids"],
          codeExamples: [
            {
              label: "GPT-2's tokenizer",
              language: "python",
              code: `import tiktoken
enc = tiktoken.get_encoding("gpt2")
ids = enc.encode("Sarathi teaches transformers")
print(ids, enc.decode(ids), enc.n_vocab)  # 50257`,
            },
          ],
          quiz: [
            {
              id: "gpt2-tok-q1",
              kind: "multiple-choice",
              prompt: "Why does GPT-2 use subword tokens instead of whole words?",
              options: [
                "Subwords are faster to embed",
                "It keeps the vocabulary finite while still covering unseen words",
                "Words cannot be converted to integers",
                "It removes the need for positional information",
              ],
              answerIndex: 1,
              explanation:
                "Subwords give open-vocabulary coverage with a fixed embedding table.",
            },
          ],
        },
        {
          id: "embeddings",
          title: "Embeddings",
          minutes: 12,
          intuition:
            "Token ids are meaningless integers until a lookup table turns them into learned vectors, and position embeddings add order.",
          objectives: [
            "Describe an embedding table as a learned lookup matrix",
            "Explain why positional embeddings are required",
            "Compute the shapes flowing into the first transformer block",
          ],
          concepts: ["Token embedding", "Positional embedding", "Embedding dimension"],
          codeExamples: [
            {
              label: "Token + position",
              language: "python",
              code: `wte = nn.Embedding(vocab_size, n_embd)
wpe = nn.Embedding(block_size, n_embd)
pos = torch.arange(t, device=idx.device)
x = wte(idx) + wpe(pos)   # (b, t, n_embd)`,
            },
          ],
          quiz: [
            {
              id: "gpt2-emb-q1",
              kind: "multiple-choice",
              prompt: "Without positional embeddings, what would self-attention lose?",
              options: [
                "The ability to distinguish token order",
                "The ability to batch sequences",
                "Gradient flow",
                "Vocabulary coverage",
              ],
              answerIndex: 0,
              explanation: "Attention is permutation-equivariant; order must be injected.",
            },
          ],
        },
      ],
    },
    {
      id: "transformer-architecture",
      title: "Transformer Architecture",
      summary: "Attention, masking, multiple heads, MLPs and the block that stacks them.",
      lessons: [
        {
          id: "self-attention",
          title: "Self-Attention",
          minutes: 18,
          intuition:
            "Each token asks a question (query), every token advertises a key, and the answer is a weighted average of values.",
          objectives: [
            "Derive the scaled dot-product attention formula",
            "Explain why the scores are divided by the square root of the head dimension",
            "Trace tensor shapes through Q, K and V",
          ],
          concepts: ["Query key value", "Scaled dot-product", "Attention weights"],
          codeExamples: [
            {
              label: "Attention, unmasked",
              language: "python",
              code: `att = (q @ k.transpose(-2, -1)) / math.sqrt(k.size(-1))
att = att.softmax(dim=-1)
out = att @ v`,
            },
          ],
          diagram: {
            title: "Attention data flow",
            mermaid: `flowchart LR
  X[Input x] --> Q[Q = xWq]
  X --> K[K = xWk]
  X --> V[V = xWv]
  Q --> S[scores = QK^T / sqrt d]
  K --> S
  S --> W[softmax weights]
  W --> O[out = weights V]
  V --> O`,
          },
          quiz: [
            {
              id: "gpt2-attn-q1",
              kind: "multiple-choice",
              prompt: "Why divide attention scores by the square root of the head dimension?",
              options: [
                "To normalise the vocabulary",
                "To keep softmax inputs from saturating as dimension grows",
                "To make the matrix square",
                "To reduce parameter count",
              ],
              answerIndex: 1,
              explanation:
                "Dot products grow with dimension; scaling keeps gradients healthy.",
            },
          ],
        },
        {
          id: "causal-self-attention",
          title: "Causal Self-Attention",
          minutes: 14,
          intuition:
            "A next-token predictor must not read the future, so we mask the upper triangle before the softmax.",
          objectives: [
            "Explain causal masking and where it is applied",
            "Implement the mask with a registered buffer",
            "Say what breaks if the mask is removed",
          ],
          concepts: ["Causal mask", "Lower triangular matrix", "Information leakage"],
          codeExamples: [
            {
              label: "Masking the future",
              language: "python",
              code: `self.register_buffer("bias", torch.tril(torch.ones(T, T)).view(1, 1, T, T))
att = att.masked_fill(self.bias[:, :, :t, :t] == 0, float("-inf"))
att = att.softmax(dim=-1)`,
            },
          ],
          quiz: [
            {
              id: "gpt2-causal-q1",
              kind: "code-prediction",
              prompt: "What happens to training loss if the causal mask is removed?",
              code: `# mask line commented out\n# att = att.masked_fill(bias == 0, float('-inf'))`,
              language: "python",
              options: [
                "Loss drops unusually fast but generation is broken",
                "Loss goes to infinity",
                "Nothing changes",
                "Training crashes with a shape error",
              ],
              answerIndex: 0,
              explanation:
                "The model peeks at the answer, so training loss collapses while sampling fails.",
            },
          ],
        },
        {
          id: "multi-head-attention",
          title: "Multi-Head Attention",
          minutes: 13,
          intuition:
            "Splitting the embedding into heads lets the model attend to several kinds of relationship at once.",
          objectives: [
            "Reshape an embedding into heads and back",
            "Explain what each head can specialise in",
            "Relate n_head and head_dim to n_embd",
          ],
          concepts: ["Attention heads", "Head dimension", "Output projection"],
          codeExamples: [
            {
              label: "Splitting heads",
              language: "python",
              code: `q = q.view(b, t, n_head, n_embd // n_head).transpose(1, 2)  # (b, nh, t, hd)
# ... attention ...
y = y.transpose(1, 2).contiguous().view(b, t, n_embd)
y = self.c_proj(y)`,
            },
          ],
          quiz: [
            {
              id: "gpt2-mha-q1",
              kind: "multiple-choice",
              prompt: "With n_embd=768 and n_head=12, what is the head dimension?",
              options: ["12", "64", "768", "9216"],
              answerIndex: 1,
              explanation: "768 / 12 = 64.",
            },
          ],
        },
        {
          id: "feed-forward-network",
          title: "Feed Forward Network",
          minutes: 10,
          intuition:
            "Attention mixes information across tokens; the MLP thinks about each token on its own, with a 4x wider hidden layer.",
          objectives: [
            "Describe the position-wise MLP and its expansion factor",
            "Explain the role of GELU",
            "Account for the parameter cost of the MLP",
          ],
          concepts: ["Position-wise MLP", "GELU", "Expansion factor"],
          codeExamples: [
            {
              label: "GPT-2's MLP",
              language: "python",
              code: `self.c_fc = nn.Linear(n_embd, 4 * n_embd)
self.gelu = nn.GELU(approximate="tanh")
self.c_proj = nn.Linear(4 * n_embd, n_embd)`,
            },
          ],
          quiz: [
            {
              id: "gpt2-ffn-q1",
              kind: "multiple-choice",
              prompt: "What does the feed forward network do that attention does not?",
              options: [
                "Mix information between tokens",
                "Transform each token independently with a nonlinearity",
                "Apply the causal mask",
                "Embed positions",
              ],
              answerIndex: 1,
              explanation: "The MLP is position-wise; attention is the cross-token operation.",
            },
          ],
        },
        {
          id: "transformer-block",
          title: "Transformer Block",
          minutes: 12,
          intuition:
            "A block is pre-norm attention plus pre-norm MLP, each added back into a residual stream that stays differentiable all the way down.",
          objectives: [
            "Assemble a block from LayerNorm, attention and MLP",
            "Explain pre-norm versus post-norm",
            "Describe the residual stream as the model's shared memory",
          ],
          concepts: ["Residual connection", "LayerNorm", "Pre-norm block"],
          codeExamples: [
            {
              label: "The block",
              language: "python",
              code: `def forward(self, x):
    x = x + self.attn(self.ln_1(x))
    x = x + self.mlp(self.ln_2(x))
    return x`,
            },
          ],
          diagram: {
            title: "Pre-norm transformer block",
            mermaid: `flowchart TB
  A[x] --> B[LayerNorm]
  B --> C[Causal self-attention]
  A --> D((+))
  C --> D
  D --> E[LayerNorm]
  E --> F[MLP]
  D --> G((+))
  F --> G
  G --> H[x out]`,
          },
          quiz: [
            {
              id: "gpt2-block-q1",
              kind: "multiple-choice",
              prompt: "Why are residual connections critical in a deep transformer?",
              options: [
                "They reduce parameter count",
                "They give gradients a short path through every layer",
                "They replace LayerNorm",
                "They enforce causality",
              ],
              answerIndex: 1,
              explanation: "The identity path keeps deep stacks trainable.",
            },
          ],
        },
      ],
    },
    {
      id: "training-gpt2",
      title: "Training GPT-2",
      summary: "Batching a dataset, the loss that supervises prediction, and the optimisation loop.",
      lessons: [
        {
          id: "preparing-dataset",
          title: "Preparing Dataset",
          minutes: 13,
          intuition:
            "Training data is one long token stream sliced into windows, where the target is simply the input shifted by one.",
          objectives: [
            "Build inputs and targets by shifting a token stream",
            "Explain the block size / context window",
            "Batch windows efficiently",
          ],
          concepts: ["Block size", "Shifted targets", "Batching"],
          codeExamples: [
            {
              label: "x and y",
              language: "python",
              code: `ix = torch.randint(len(data) - block_size, (batch_size,))
x = torch.stack([data[i:i + block_size] for i in ix])
y = torch.stack([data[i + 1:i + 1 + block_size] for i in ix])`,
            },
          ],
          quiz: [
            {
              id: "gpt2-data-q1",
              kind: "multiple-choice",
              prompt: "What is the target for input tokens [a, b, c]?",
              options: ["[a, b, c]", "[b, c, d]", "[c, b, a]", "A single label"],
              answerIndex: 1,
              explanation: "Targets are the inputs shifted one position to the left.",
            },
          ],
        },
        {
          id: "cross-entropy-loss",
          title: "Cross Entropy Loss",
          minutes: 12,
          intuition:
            "Cross entropy is the negative log probability the model assigned to the correct next token — and its exponential is perplexity.",
          objectives: [
            "Compute cross entropy over flattened logits and targets",
            "Interpret the loss value at initialisation",
            "Relate loss to perplexity",
          ],
          concepts: ["Cross entropy", "Logits", "Perplexity"],
          codeExamples: [
            {
              label: "Loss over all positions",
              language: "python",
              code: `loss = F.cross_entropy(
    logits.view(-1, logits.size(-1)),
    targets.view(-1),
)`,
            },
          ],
          quiz: [
            {
              id: "gpt2-loss-q1",
              kind: "multiple-choice",
              prompt: "With a 50257-token vocabulary, roughly what loss does an untrained model show?",
              options: ["0", "About 1.4", "About 10.8", "About 50257"],
              answerIndex: 2,
              explanation: "ln(50257) is about 10.8 — uniform guessing.",
            },
          ],
        },
        {
          id: "training-loop",
          title: "Training Loop",
          minutes: 15,
          intuition:
            "Forward, loss, backward, clip, step, zero — with a learning-rate schedule that warms up and then decays.",
          objectives: [
            "Write a correct AdamW training step",
            "Explain gradient clipping and warmup",
            "Track validation loss to spot overfitting",
          ],
          concepts: ["AdamW", "Gradient clipping", "Learning rate schedule"],
          codeExamples: [
            {
              label: "One step",
              language: "python",
              code: `optimizer.zero_grad(set_to_none=True)
logits, loss = model(x, y)
loss.backward()
torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
optimizer.step()`,
            },
          ],
          quiz: [
            {
              id: "gpt2-loop-q1",
              kind: "multiple-choice",
              prompt: "What does clip_grad_norm_ protect against?",
              options: [
                "Overfitting",
                "Exploding gradients destabilising a step",
                "Vanishing embeddings",
                "Tokenizer errors",
              ],
              answerIndex: 1,
              explanation: "It rescales the gradient when its norm is too large.",
            },
          ],
        },
      ],
    },
    {
      id: "text-generation",
      title: "Text Generation",
      summary: "Turning a trained model back into text.",
      lessons: [
        {
          id: "text-generation",
          title: "Text Generation",
          minutes: 14,
          intuition:
            "Sampling is a loop: take the last logits, shape the distribution with temperature and top-k, draw a token, append, repeat.",
          objectives: [
            "Implement autoregressive sampling with a context crop",
            "Explain temperature and top-k",
            "Compare greedy decoding with sampling",
          ],
          concepts: ["Temperature", "Top-k sampling", "Greedy decoding"],
          codeExamples: [
            {
              label: "Generate",
              language: "python",
              code: `for _ in range(max_new_tokens):
    idx_cond = idx[:, -block_size:]
    logits, _ = model(idx_cond)
    logits = logits[:, -1, :] / temperature
    v, _ = torch.topk(logits, top_k)
    logits[logits < v[:, [-1]]] = -float("inf")
    probs = logits.softmax(dim=-1)
    idx = torch.cat([idx, torch.multinomial(probs, 1)], dim=1)`,
            },
          ],
          quiz: [
            {
              id: "gpt2-gen-q1",
              kind: "multiple-choice",
              prompt: "What does lowering the temperature towards 0 do?",
              options: [
                "Makes sampling more random",
                "Makes sampling approach greedy decoding",
                "Increases the vocabulary",
                "Disables top-k",
              ],
              answerIndex: 1,
              explanation: "Low temperature sharpens the distribution onto the argmax.",
            },
          ],
        },
      ],
    },
  ],
};
