from datasets import load_dataset
import os

os.makedirs("data", exist_ok=True)

# Load the AMC mathematics dataset
dataset = load_dataset("furonghuang-lab/Easy2Hard-Bench", "E2H-AMC")

# Save to disk
dataset.save_to_disk("data/E2H-AMC")

# View the first example in the test split
print(dataset['eval'][0])
print(f"\nDataset saved to data/E2H-AMC")
