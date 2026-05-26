# Complete Binding Site Details Extraction Pipeline - Single CSV Output Version
"""
It scans ion-bound PDB structures, extracts nearby standard amino acids around each ion, 
computes residue/site statistics, and saves everything into a single comprehensive CSV for each ion.

Usage: python Binding_site_details.py --output_folder_location ../Figures --ion_symbols PO4 --ion_names Phosphate --distance 5.0
"""

from Bio import PDB
import os
import pickle
import argparse
import requests
from Bio.PDB import PDBParser, PDBIO
from pathlib import Path
import re
import numpy as np
import pandas as pd
from tqdm.auto import tqdm
from collections import defaultdict, Counter
from Bio.PDB import StructureBuilder
import sys
import math

# Assuming phosbind_utils is available - if not, you'll need to implement these functions
try:
    sys.path.append("../Utils")
    from phosfate_utils import get_closest_all_atoms_and_residues_and_indices_v3, get_chain_sequence, check_dir, ion_classification
except ImportError:
    print("Warning: phosfate_utils not found. Using fallback functions.")
    
    def get_closest_all_atoms_and_residues_and_indices_v3(model, ref_atom, distance):
        """Fallback implementation"""
        pass
    
    def get_chain_sequence(chain):
        """Fallback implementation"""
        pass
    
    def check_dir(directory):
        """Create directory if it doesn't exist"""
        os.makedirs(directory, exist_ok=True)
    
    ion_classification = {}

def is_standard_amino_acid(residue):
    """
    Check if a residue is a STANDARD amino acid only (no modified amino acids)
    Returns True only for the 20 standard amino acids
    """
    standard_amino_acids = {
        'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLU', 'GLN', 'GLY', 'HIS', 'ILE',
        'LEU', 'LYS', 'MET', 'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL',
        'CYX', 'CYM', 'MSE'
    }
    
    try:
        resname = residue.get_resname().strip()
        is_standard = resname in standard_amino_acids
        hetflag = residue.get_id()[0]
        is_protein_residue = hetflag == ' '
        
        return is_standard and is_protein_residue
    except (AttributeError, IndexError) as e:
        print(f"Warning: Error checking residue {residue}: {e}")
        return False

def get_amino_acid_properties():
    """
    Return a dictionary with amino acid properties for analysis
    """
    aa_properties = {
        'ALA': {'class': 'Nonpolar', 'charge': 'Neutral', 'size': 'Small', 'hydrophobicity': 'Hydrophobic'},
        'ARG': {'class': 'Basic', 'charge': 'Positive', 'size': 'Large', 'hydrophobicity': 'Hydrophilic'},
        'ASN': {'class': 'Polar', 'charge': 'Neutral', 'size': 'Medium', 'hydrophobicity': 'Hydrophilic'},
        'ASP': {'class': 'Acidic', 'charge': 'Negative', 'size': 'Medium', 'hydrophobicity': 'Hydrophilic'},
        'CYS': {'class': 'Polar', 'charge': 'Neutral', 'size': 'Small', 'hydrophobicity': 'Hydrophobic'},
        'GLU': {'class': 'Acidic', 'charge': 'Negative', 'size': 'Medium', 'hydrophobicity': 'Hydrophilic'},
        'GLN': {'class': 'Polar', 'charge': 'Neutral', 'size': 'Medium', 'hydrophobicity': 'Hydrophilic'},
        'GLY': {'class': 'Nonpolar', 'charge': 'Neutral', 'size': 'Small', 'hydrophobicity': 'Neutral'},
        'HIS': {'class': 'Basic', 'charge': 'Positive', 'size': 'Large', 'hydrophobicity': 'Hydrophilic'},
        'ILE': {'class': 'Nonpolar', 'charge': 'Neutral', 'size': 'Large', 'hydrophobicity': 'Hydrophobic'},
        'LEU': {'class': 'Nonpolar', 'charge': 'Neutral', 'size': 'Large', 'hydrophobicity': 'Hydrophobic'},
        'LYS': {'class': 'Basic', 'charge': 'Positive', 'size': 'Large', 'hydrophobicity': 'Hydrophilic'},
        'MET': {'class': 'Nonpolar', 'charge': 'Neutral', 'size': 'Large', 'hydrophobicity': 'Hydrophobic'},
        'PHE': {'class': 'Nonpolar', 'charge': 'Neutral', 'size': 'Large', 'hydrophobicity': 'Hydrophobic'},
        'PRO': {'class': 'Nonpolar', 'charge': 'Neutral', 'size': 'Medium', 'hydrophobicity': 'Hydrophobic'},
        'SER': {'class': 'Polar', 'charge': 'Neutral', 'size': 'Small', 'hydrophobicity': 'Hydrophilic'},
        'THR': {'class': 'Polar', 'charge': 'Neutral', 'size': 'Medium', 'hydrophobicity': 'Hydrophilic'},
        'TRP': {'class': 'Nonpolar', 'charge': 'Neutral', 'size': 'Large', 'hydrophobicity': 'Hydrophobic'},
        'TYR': {'class': 'Polar', 'charge': 'Neutral', 'size': 'Large', 'hydrophobicity': 'Hydrophilic'},
        'VAL': {'class': 'Nonpolar', 'charge': 'Neutral', 'size': 'Medium', 'hydrophobicity': 'Hydrophobic'},
        'CYX': {'class': 'Polar', 'charge': 'Neutral', 'size': 'Small', 'hydrophobicity': 'Hydrophobic'},
        'CYM': {'class': 'Polar', 'charge': 'Negative', 'size': 'Small', 'hydrophobicity': 'Hydrophilic'},
        'MSE': {'class': 'Nonpolar', 'charge': 'Neutral', 'size': 'Large', 'hydrophobicity': 'Hydrophobic'}
    }
    return aa_properties

def analyze_binding_pocket_for_single_csv(closest_residues, ref_atom, pdb_id, chain_id, 
                                         binding_site_index, ion_symbol, ion_name, 
                                         distance, sequence, coordinating_atoms):
    """
    Analyze binding pocket residues and return rows for single CSV file
    Each residue becomes a row in the final CSV
    """
    aa_properties = get_amino_acid_properties()
    csv_rows = []
    
    # Calculate binding site statistics
    residue_frequencies = Counter([r.get_resname() for r in closest_residues])
    property_counts = {
        'class': Counter(),
        'charge': Counter(),
        'size': Counter(),
        'hydrophobicity': Counter()
    }
    
    distances_to_ion = []
    
    # First pass: collect statistics
    for residue in closest_residues:
        resname = residue.get_resname()
        properties = aa_properties.get(resname, {
            'class': 'Unknown', 'charge': 'Unknown', 
            'size': 'Unknown', 'hydrophobicity': 'Unknown'
        })
        
        # Update property counters
        for prop_type, prop_value in properties.items():
            property_counts[prop_type][prop_value] += 1
        
        # Calculate distance from ion to residue (closest atom in residue)
        min_distance = float('inf')
        for atom in residue:
            dist = np.linalg.norm(atom.get_coord() - ref_atom.get_coord())
            if dist < min_distance:
                min_distance = dist
        distances_to_ion.append(min_distance)
    
    # Calculate summary statistics
    total_residues = len(closest_residues)
    unique_residues = len(residue_frequencies)
    avg_distance = np.mean(distances_to_ion) if distances_to_ion else 0
    min_distance = min(distances_to_ion) if distances_to_ion else 0
    max_distance = max(distances_to_ion) if distances_to_ion else 0
    
    # Find dominant properties
    most_frequent_aa = max(residue_frequencies.items(), key=lambda x: x[1])[0] if residue_frequencies else 'N/A'
    dominant_class = max(property_counts['class'].items(), key=lambda x: x[1])[0] if property_counts['class'] else 'N/A'
    dominant_charge = max(property_counts['charge'].items(), key=lambda x: x[1])[0] if property_counts['charge'] else 'N/A'
    dominant_size = max(property_counts['size'].items(), key=lambda x: x[1])[0] if property_counts['size'] else 'N/A'
    dominant_hydrophobicity = max(property_counts['hydrophobicity'].items(), key=lambda x: x[1])[0] if property_counts['hydrophobicity'] else 'N/A'
    
    # Create frequency strings for CSV
    aa_frequency_str = ';'.join([f"{aa}:{count}" for aa, count in residue_frequencies.most_common()])
    aa_percentage_str = ';'.join([f"{aa}:{(count/total_residues)*100:.1f}%" for aa, count in residue_frequencies.most_common()])
    
    # Create property distribution strings
    class_dist_str = ';'.join([f"{prop}:{count}" for prop, count in property_counts['class'].most_common()])
    charge_dist_str = ';'.join([f"{prop}:{count}" for prop, count in property_counts['charge'].most_common()])
    size_dist_str = ';'.join([f"{prop}:{count}" for prop, count in property_counts['size'].most_common()])
    hydrophobic_dist_str = ';'.join([f"{prop}:{count}" for prop, count in property_counts['hydrophobicity'].most_common()])
    
    # Second pass: create individual residue rows
    for i, residue in enumerate(closest_residues):
        resname = residue.get_resname()
        properties = aa_properties.get(resname, {
            'class': 'Unknown', 'charge': 'Unknown', 
            'size': 'Unknown', 'hydrophobicity': 'Unknown'
        })
        
        # Calculate distance from ion to residue
        min_distance = float('inf')
        closest_atom = None
        for atom in residue:
            dist = np.linalg.norm(atom.get_coord() - ref_atom.get_coord())
            if dist < min_distance:
                min_distance = dist
                closest_atom = atom
        
        # Create row for this residue
        row = {
            # Basic identifiers
            'pdb_id': pdb_id,
            'chain_id': chain_id,
            'binding_site_index': binding_site_index,
            'ion_symbol': ion_symbol,
            'ion_name': ion_name,
            'distance_cutoff': distance,
            
            # Sequence information
            'sequence': sequence,
            'sequence_length': len(sequence),
            'coordinating_atoms_total': coordinating_atoms,
            'coordinating_residues_total': total_residues,
            
            # Individual residue information
            'residue_position_in_site': i + 1,
            'residue_name': resname,
            'residue_id': residue.get_id()[1],
            'distance_to_ion': round(min_distance, 3),
            'closest_atom': closest_atom.get_id() if closest_atom else 'N/A',
            
            # Amino acid properties
            'aa_class': properties['class'],
            'aa_charge': properties['charge'],
            'aa_size': properties['size'],
            'aa_hydrophobicity': properties['hydrophobicity'],
            
            # Binding site statistics (same for all residues in this site)
            'site_unique_aa_types': unique_residues,
            'site_avg_distance_to_ion': round(avg_distance, 3),
            'site_min_distance_to_ion': round(min_distance, 3),
            'site_max_distance_to_ion': round(max_distance, 3),
            
            # Dominant properties for the entire binding site
            'site_most_frequent_aa': most_frequent_aa,
            'site_dominant_class': dominant_class,
            'site_dominant_charge': dominant_charge,
            'site_dominant_size': dominant_size,
            'site_dominant_hydrophobicity': dominant_hydrophobicity,
            
            # Frequency distributions (for entire binding site)
            'site_aa_frequencies': aa_frequency_str,
            'site_aa_percentages': aa_percentage_str,
            'site_class_distribution': class_dist_str,
            'site_charge_distribution': charge_dist_str,
            'site_size_distribution': size_dist_str,
            'site_hydrophobicity_distribution': hydrophobic_dist_str,
            
            # Individual residue frequency in this site
            'residue_frequency_in_site': residue_frequencies[resname],
            'residue_percentage_in_site': round((residue_frequencies[resname] / total_residues) * 100, 1)
        }
        
        csv_rows.append(row)
    
    return csv_rows

def create_parser():
    """Create and return argument parser"""
    parser = argparse.ArgumentParser(
        description="Extract and analyze binding pocket amino acids, saving all results in a single CSV file"
    )
    parser.add_argument(
        "--ion_symbols",
        type=str,
        required=False,
        help="Ion symbols to analyze (e.g., PO4,MG,K)",
    )
    parser.add_argument(
        "--input_file",
        type=str,
        default=None,
        required=False,
        help="Load arguments from this input file",
    )
    parser.add_argument(
        "--ion_names",
        type=str,
        required=True,
        help="Ion names corresponding to symbols (e.g., Phosphate,Magnesium,Potassium)",
    )
    parser.add_argument(
        "--output_folder_location",
        type=str,
        required=True,
        help="Output folder location for CSV file",
    )
    parser.add_argument(
        "--distance",
        type=float,
        required=True,
        help="Distance cutoff for binding site definition (Angstroms)",
    )
    parser.add_argument(
        "--logfile",
        type=str,
        required=False,
        default="logfile.log",
        help="Log file name",
    )
    return parser

def parse_arguments_from_file(file_path):
    """Parse arguments from input file"""
    with open(file_path, 'r') as file:
        lines = file.readlines()
    arguments = [line.strip().split() for line in lines]
    return sum(arguments, [])

def validate_arguments(parser, args):
    """Validate required arguments"""
    required_arguments = ["output_folder_location", "ion_symbols", "ion_names", "distance"]
    for argument in required_arguments:
        if argument not in vars(args) or not getattr(args, argument):
            raise ValueError(f"--{argument} is a required argument.")

def get_ion_atoms_from_chain(chain, ion_symbol):
    """Extract ion atoms from a chain"""
    list_of_ion_atoms = []
    
    for residue in chain:
        if residue.get_resname() == ion_symbol:
            ion_info = ion_classification.get(ion_symbol, {})
            ion_type = ion_info.get("type", "single atom")
            main_atom = ion_info.get("main_atom", None)  
                
            for atom in residue:
                if ion_type == "molecule":
                    if atom.get_id() == main_atom:
                        list_of_ion_atoms.append(atom)
                else:
                    list_of_ion_atoms.append(atom)
    
    return list_of_ion_atoms

def collect_sequences_and_ions(first_model, pdb_id, ion_symbol):
    """Collect sequences and ion atoms from all chains in the model"""
    seq_store_local = []
    list_of_ion_atoms = []
    
    for chain in first_model:
        chain_id = chain.get_id()
        seq_label = f"{pdb_id}-chain-{chain_id}"
        
        # Simple sequence extraction if get_chain_sequence is not available
        try:
            sequence = get_chain_sequence(chain)
        except:
            # Fallback sequence extraction
            sequence = ""
            aa_map = {
                'ALA': 'A', 'ARG': 'R', 'ASN': 'N', 'ASP': 'D', 'CYS': 'C',
                'GLU': 'E', 'GLN': 'Q', 'GLY': 'G', 'HIS': 'H', 'ILE': 'I',
                'LEU': 'L', 'LYS': 'K', 'MET': 'M', 'PHE': 'F', 'PRO': 'P',
                'SER': 'S', 'THR': 'T', 'TRP': 'W', 'TYR': 'Y', 'VAL': 'V',
                'MSE': 'M', 'CYX': 'C', 'CYM': 'C'
            }
            for residue in chain:
                if is_standard_amino_acid(residue):
                    sequence += aa_map.get(residue.get_resname(), 'X')
        
        seq_store_local.append([seq_label, sequence])
        
        # Get ion atoms from this chain
        chain_ion_atoms = get_ion_atoms_from_chain(chain, ion_symbol)
        list_of_ion_atoms.extend(chain_ion_atoms)
    
    return seq_store_local, list_of_ion_atoms

def safe_get_closest_atoms_and_residues(first_model, ref_atom, distance):
    """
    Safely get closest atoms and residues, with fallback if utility function unavailable
    """
    try:
        return get_closest_all_atoms_and_residues_and_indices_v3(first_model, ref_atom, distance)
    except (ValueError, RuntimeWarning, NameError) as e:
        print(f"Warning: Using fallback distance calculation: {e}")
        # Fallback implementation
        atoms = []
        residues = []
        indices_dict = {}
        
        ref_coord = ref_atom.get_coord()
        
        for chain in first_model:
            chain_residues = []
            chain_indices = []
            
            for residue in chain:
                if is_standard_amino_acid(residue):
                    min_dist = float('inf')
                    for atom in residue:
                        dist = np.linalg.norm(atom.get_coord() - ref_coord)
                        if dist < min_dist:
                            min_dist = dist
                    
                    if min_dist <= distance:
                        residues.append(residue)
                        chain_residues.append(residue)
                        chain_indices.append(residue.get_id()[1])
                        
                        # Collect atoms within distance
                        for atom in residue:
                            atom_dist = np.linalg.norm(atom.get_coord() - ref_coord)
                            if atom_dist <= distance:
                                atoms.append(atom)
            
            if chain_indices:
                indices_dict[chain.get_id()] = chain_indices
        
        return atoms, residues, indices_dict

def process_binding_site_single_csv(ref_atom, first_model, distance, ion_symbol, binding_site_index,
                                   seq_store_local, structure, output_folder, pdb_id, 
                                   sites_with_non_standard_residues, long_chain_PDBS, all_csv_rows,
                                   ion_name):
    """Process a single binding site and add rows to the master CSV data"""
    # Get nearby atoms/residues with error handling
    try:
        atoms, closest_residues, indexes_for_averaging = safe_get_closest_atoms_and_residues(first_model, ref_atom, distance)
    except Exception as e:
        print(f"Error processing binding site in {pdb_id}: {e}")
        return False
        
    coordinating_number_atom = len(atoms)
    
    # Skip if any non-standard residues
    non_standard = [r for r in closest_residues if not is_standard_amino_acid(r)]
    if non_standard:
        print(f"Skipped {pdb_id} due to non-standard/modified amino acid(s): {[r.get_resname() for r in non_standard]}")
        sites_with_non_standard_residues.append(f"{pdb_id}")
        return False
    
    # Warn if no residues found
    if not closest_residues:
        print(f"No residues within {distance}Å of site-{binding_site_index}")
        return False

    # Process each chain's sequence
    for seq_label, sequence in seq_store_local:
        cid = seq_label.split("-chain-")[1]
        coords = indexes_for_averaging.get(cid, [])

        # Skip chains that don't have binding sites for this ion
        if not coords:
            continue

        # Skip very long chains
        if len(sequence) >= 1024:
            long_chain_PDBS.append(seq_label)
            continue

        chain_id = cid

        # Find the chain
        chain_with_site = None
        for chain in first_model:
            if chain.id == chain_id:
                chain_with_site = chain
                break

        if chain_with_site:
            try:
                # Analyze binding pocket and get CSV rows
                csv_rows = analyze_binding_pocket_for_single_csv(
                    closest_residues, ref_atom, pdb_id, chain_id, binding_site_index,
                    ion_symbol, ion_name, distance, sequence, coordinating_number_atom
                )
                
                # Add all rows to the master list
                all_csv_rows.extend(csv_rows)
                
                print(f"Added {len(csv_rows)} residue rows for {pdb_id} chain {chain_id} site {binding_site_index}")
                
            except Exception as e:
                print(f"Error analyzing binding site for {pdb_id} chain {chain_id}: {e}")
                return False
    
    return True

def process_single_pdb(filename, ion_symbol, distance, output_folder, ion_name,
                      seq_store_global, all_csv_rows, binding_site_index,
                      long_chain_PDBS, sites_with_non_standard_residues, progress_tracker_file,
                      filenumber, total_files):
    """Process a single PDB file and add rows to master CSV data"""
    with open(progress_tracker_file, 'a') as file:
        print(f"Working on {filenumber}/{total_files} - {filename}", file=file)

    try:
        # Parse structure
        parser = PDBParser(QUIET=True)
        structure = parser.get_structure("protein", filename)
        first_model = next(structure.get_models())

        # Collect sequences and ion atoms
        pdb_id = Path(filename).stem
        seq_store_local, list_of_ion_atoms = collect_sequences_and_ions(first_model, pdb_id, ion_symbol)
        
        # Add to global sequence store
        seq_store_global.extend(seq_store_local)
        
        # Process each ion atom
        for ref_atom in list_of_ion_atoms:
            binding_site_index += 1
            success = process_binding_site_single_csv(ref_atom, first_model, distance, ion_symbol, 
                                                     binding_site_index, seq_store_local, structure, 
                                                     output_folder, pdb_id, sites_with_non_standard_residues, 
                                                     long_chain_PDBS, all_csv_rows, ion_name)
            if not success:
                binding_site_index -= 1
    
    except Exception as e:
        print(f"Error processing {filename}: {e}")
        with open(progress_tracker_file, 'a') as file:
            print(f"ERROR processing {filename}: {e}", file=file)
    
    return binding_site_index

def save_single_csv_file(output_folder, all_csv_rows, ion_name, ion_symbol, distance, 
                        long_chain_PDBS, sites_with_non_standard_residues):
    """Save all data to a single comprehensive CSV file"""
    if not all_csv_rows:
        print(f"No data to save for {ion_name}")
        return
    
    # Create DataFrame from all rows
    df = pd.DataFrame(all_csv_rows)
    
    # Save the main CSV file
    csv_filename = f"{ion_name}_complete_binding_analysis_distance_{distance}.csv"
    csv_path = os.path.join(output_folder, csv_filename)
    df.to_csv(csv_path, index=False)
    
    # Calculate summary statistics
    total_binding_sites = df['binding_site_index'].nunique()
    total_residues = len(df)
    unique_pdbs = df['pdb_id'].nunique()
    
    # Create summary statistics file
    summary_stats = {
        'total_binding_sites': total_binding_sites,
        'total_residues_analyzed': total_residues,
        'unique_pdbs_processed': unique_pdbs,
        'long_chains_skipped': len(long_chain_PDBS),
        'sites_with_non_standard_residues': len(sites_with_non_standard_residues),
        'distance_cutoff': distance,
        'ion_name': ion_name,
        'ion_symbol': ion_symbol
    }
    
    # Amino acid frequency across all sites
    aa_counts = df['residue_name'].value_counts()
    most_common_aa = aa_counts.index[0] if len(aa_counts) > 0 else 'N/A'
    
    # Property distributions
    class_counts = df['aa_class'].value_counts()
    charge_counts = df['aa_charge'].value_counts()
    size_counts = df['aa_size'].value_counts()
    hydrophobic_counts = df['aa_hydrophobicity'].value_counts()
    
    # Save detailed statistics
    stats_file = os.path.join(output_folder, f"{ion_name}_analysis_statistics.txt")
    with open(stats_file, 'w') as f:
        f.write(f"=== {ion_name} Binding Site Complete Analysis Statistics ===\n\n")
        f.write(f"Main CSV file: {csv_filename}\n")
        f.write(f"Total binding sites: {total_binding_sites}\n")
        f.write(f"Total residues analyzed: {total_residues}\n")
        f.write(f"Unique PDB structures: {unique_pdbs}\n")
        f.write(f"Distance cutoff: {distance} Å\n")
        f.write(f"Long chains skipped: {len(long_chain_PDBS)}\n")
        f.write(f"Sites with non-standard residues skipped: {len(sites_with_non_standard_residues)}\n\n")
        
        f.write("=== Amino Acid Frequency Distribution ===\n")
        for aa, count in aa_counts.head(20).items():
            percentage = (count / total_residues) * 100
            f.write(f"{aa}: {count} ({percentage:.1f}%)\n")
        
        f.write(f"\n=== Property Distributions ===\n")
        f.write("Chemical Class:\n")
        for prop, count in class_counts.items():
            percentage = (count / total_residues) * 100
            f.write(f"  {prop}: {count} ({percentage:.1f}%)\n")
        
        f.write("Charge:\n")
        for prop, count in charge_counts.items():
            percentage = (count / total_residues) * 100
            f.write(f"  {prop}: {count} ({percentage:.1f}%)\n")
        
        f.write("Size:\n")
        for prop, count in size_counts.items():
            percentage = (count / total_residues) * 100
            f.write(f"  {prop}: {count} ({percentage:.1f}%)\n")
        
        f.write("Hydrophobicity:\n")
        for prop, count in hydrophobic_counts.items():
            percentage = (count / total_residues) * 100
            f.write(f"  {prop}: {count} ({percentage:.1f}%)\n")
    
    print(f"Saved complete analysis to: {csv_path}")
    print(f"Total rows in CSV: {len(df)}")
    print(f"Binding sites analyzed: {total_binding_sites}")

def process_ion_single_csv(ion_name, ion_symbol, args):
    """Process all PDB files for a single ion type - Single CSV version"""
    pdbs_folder_address = f"../phospred_work/Data_new/Ion-Unique-PDBs/{ion_name}-unique-pdbs/"
    
    # Check if the directory exists
    if not os.path.exists(pdbs_folder_address):
        print(f"Error: PDB directory not found: {pdbs_folder_address}")
        print(f"Please check the path or create the directory structure.")
        return
        
    list_of_files = [pdbs_folder_address + item for item in os.listdir(pdbs_folder_address) 
                     if item.endswith('.pdb')]
    
    if not list_of_files:
        print(f"No PDB files found in {pdbs_folder_address}")
        return
        
    distance = float(args.distance)
    output_folder = f"../{args.output_folder_location}/Binding_site_details_csv/Distance-{distance}/{ion_name}"
    check_dir(output_folder)

    # Initialize storage - single list for all CSV rows
    seq_store_global = []
    all_csv_rows = []  # This will contain ALL residue rows from ALL binding sites
    binding_site_index = 0
    long_chain_PDBS = []
    sites_with_non_standard_residues = []
    
    # Setup progress log
    progress_tracker_file = os.path.join(output_folder, f"run_{ion_name}-single-csv-extraction-Progress-tracker.log")
    with open(progress_tracker_file, 'w') as file:
        print(f"Starting Single CSV binding site extraction for {ion_name}", file=file)
        print(f"Found {len(list_of_files)} PDB files to process", file=file)
    
    # Process each PDB
    for filenumber, filename in enumerate(list_of_files, start=1):
        binding_site_index = process_single_pdb(
            filename, ion_symbol, distance, output_folder, ion_name,
            seq_store_global, all_csv_rows, binding_site_index,
            long_chain_PDBS, sites_with_non_standard_residues, 
            progress_tracker_file, filenumber, len(list_of_files))

    # Save single comprehensive CSV file
    save_single_csv_file(output_folder, all_csv_rows, ion_name, ion_symbol, distance,
                         long_chain_PDBS, sites_with_non_standard_residues)
    
    # Final progress update
    with open(progress_tracker_file, 'a') as file:
        print(f"Completed Single CSV processing {ion_name}: {binding_site_index} binding sites extracted", file=file)
        print(f"Total residue rows generated: {len(all_csv_rows)}", file=file)
        print(f"Long chains skipped: {len(long_chain_PDBS)}", file=file)
        print(f"Sites with non-standard residues skipped: {len(sites_with_non_standard_residues)}", file=file)

def main():
    """Main function to orchestrate the Single CSV binding site extraction"""
    parser = create_parser()
    args = parser.parse_args()
    
    # Check if no arguments provided
    if all(value is None or value == '' for key, value in vars(args).items() if key != 'logfile'):
        print("Usage: python Binding_site_details.py --output_folder_location Figures --ion_symbols PO4 --ion_names Phosphate --distance 5.0")
        print("\nExample:")
        print("python Binding_site_details.py --output_folder_location Figures --ion_symbols PO4,MG,K --ion_names Phosphate,Magnesium,Potassium --distance 5.0")
        exit()
    
    # Handle input file if provided
    if args.input_file:
        file_arguments = parse_arguments_from_file(args.input_file)
        # Override default values with arguments from the file
        for i, arg in enumerate(file_arguments):
            if arg.startswith('--'):
                arg_name = arg[2:]  # Remove '--'
                if i + 1 < len(file_arguments) and not file_arguments[i + 1].startswith('--'):
                    setattr(args, arg_name, file_arguments[i + 1])
    
    # Validate arguments
    try:
        validate_arguments(parser, args)
    except ValueError as e:
        print(f"Error: {e}")
        exit(1)
    
    # Parse ion names and symbols
    ion_names_in_a_list = [name.strip() for name in args.ion_names.split(",")]
    ion_symbols_in_a_list = [symbol.strip() for symbol in args.ion_symbols.split(",")]
    
    if len(ion_names_in_a_list) != len(ion_symbols_in_a_list):
        print("Error: Number of ion names must match number of ion symbols")
        exit(1)

    print(f"Starting Single CSV binding site extraction for ions: {ion_names_in_a_list}")
    print(f"Ion symbols: {ion_symbols_in_a_list}")
    print(f"Distance cutoff: {args.distance} Å")
    print(f"Output folder: {args.output_folder_location}")

    # Process each ion type
    for ion_name, ion_symbol in zip(ion_names_in_a_list, ion_symbols_in_a_list):
        print(f"\n=== Processing {ion_name} ({ion_symbol}) ===")
        process_ion_single_csv(ion_name, ion_symbol, args)

    print("\nSingle CSV binding site analysis completed for all ions!")
    print("\nFor each ion, one comprehensive CSV file was generated containing:")
    print("  - All binding sites and their residues in a single file")
    print("  - Individual residue details with distances and properties")
    print("  - Binding site statistics and amino acid distributions")
    print("  - Complete frequency analysis for each binding site")
    print("\nOutput files per ion:")
    print("  - {ion_name}_complete_binding_analysis_distance_{distance}.csv")
    print("  - {ion_name}_analysis_statistics.txt")

if __name__ == "__main__":
    main()