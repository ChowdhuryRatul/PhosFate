from __future__ import print_function
import os
import shutil
import pickle
import requests
import re
import inspect
import math
import math as m
from pathlib import Path
from random import *
import numpy as np
import scipy as sp
from scipy.linalg import orthogonal_procrustes
import matplotlib.pyplot as plt
import seaborn as sns
from Bio import SeqIO, PDB
from Bio.PDB import PDBParser, PDBIO
from Bio.Data.IUPACData import protein_letters_3to1
from Bio.PDB.Polypeptide import is_aa
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.data import Data
from torch_geometric.nn import GCNConv
from torch_geometric.utils import to_networkx
import networkx as nx
from transformers import T5EncoderModel, T5Tokenizer
import esm
from rdkit import Chem
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix
from imblearn.over_sampling import SMOTE


def check_dir(folder_path):
    if not os.path.exists(folder_path):
        os.makedirs(folder_path)
        print(f"Folder '{folder_path}' created.")
    else:
        print(f"Folder '{folder_path}' already exists.")


def add_to_logfile(logfile_path, text):
    with open(logfile_path, 'a') as file:
        file.write(f"{text}")


def download_pdb_with_ion(ion, output_folder):
    """ This function downloads all the PDB files containing particular ion of interest from the RCSB API and saves them in a folder.
    Args:
        ion (str): The name of the ion of interest.
        output_folder (str): The folder where the PDB files will be saved.
    Return:
        None"""
    # Define the API URL to search for PDB entries with sodium ions
    api_url = "https://search.rcsb.org/rcsbsearch/v2/query"

    # Define the JSON query to search for entries with sodium ions
    #query = {"query":{"type":"terminal","label":"text_chem","service":"text_chem","parameters":{"attribute":"rcsb_chem_comp_container_identifiers.comp_id","negation":False,"operator":"in","value":[ion]}},"return_type":"entry","request_options":{"return_all_hits": True,"results_content_type":["experimental"],"sort":[{"sort_by":"score","direction":"desc"}],"scoring_strategy":"combined"}}
    query = {"query":{"type":"group","logical_operator":"and","nodes":[{"type":"terminal","label":"text_chem","service":"text_chem","parameters": {"attribute": "rcsb_chem_comp_container_identifiers.comp_id","negation": False,"operator": "in","value": [ion]}},{"type": "terminal","service": "text","parameters": {"attribute": "entity_poly.rcsb_entity_polymer_type","value": "Protein","operator": "exact_match"}}]},"return_type": "entry","request_options": {"return_all_hits": True,"results_content_type": ["experimental"],"sort": [{"sort_by": "score","direction": "desc"}],"scoring_strategy": "combined"}}

    # Make a POST request to the API
    response = requests.post(api_url, json=query)

    if response.status_code == 200:
        # Parse the response to get PDB IDs
        pdb_ids = response.json()['result_set']

        # Download PDB files
        for pdb_id in pdb_ids:
            try:
                pdb_name=pdb_id['identifier']
                pdb_url = f"https://files.rcsb.org/download/{pdb_name}.pdb"
                pdb_file_path = os.path.join(output_folder, f"{pdb_name}.pdb")

                # Download the PDB file
                pdb_content = requests.get(pdb_url).text

                with open(pdb_file_path, 'w') as pdb_file:
                    pdb_file.write(pdb_content)

                print(f"Downloaded {pdb_id} to {pdb_file_path}")

            except Exception as e:
                print(f"Error downloading {pdb_id}: {str(e)}")

    else:
        print(f"Error querying the RCSB PDB API: {response.status_code}")

def split_chains_and_save(structure, output_folder, input_pdb_path):
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    for model in structure:
        for chain in model:
            chain_id = chain.id
            io = PDBIO()
            io.set_structure(chain)
            output_filename = f"{output_folder}/{input_pdb_path.stem}-Chain-{chain_id}.pdb"
            io.save(output_filename)

def write_to_fasta_file(input_folder, output_fasta,logfile):
    # Open the output Fasta file for writing
    error_files = []
    
    with open(output_fasta, "w") as fasta_file:
        # Iterate through all files in the input folder
        for i,filename in enumerate(os.listdir(input_folder)):
            j=len(os.listdir(input_folder))
            
            # Check if the file is a PDB file
            if filename.endswith(".pdb"):
                try:
                    pdb_path = os.path.join(input_folder, filename)
                    # Parse the PDB file and extract the sequence
                    parser = PDB.PDBParser() 
                    structure = parser.get_structure('protein',pdb_path)
                    for chain in structure.get_chains():
                        sequence = get_chain_sequence(chain)
                        # structure = SeqIO.read(pdb_file, "pdb-atom")
                        # sequence = str(structure.seq)
                        if len(sequence) > 0:
                            # Write the sequence to the Fasta file
                            fasta_file.write(f">{filename[:-4]}\n{sequence}\n")
                            print(f"Worked well. {filename}")
                            print(f"{i} of {j} done.")
                except:
                    print(f"Ran into error. {filename}")
                    # import pdb;pdb.set_trace()
                    error_files.append(f"{filename}")
            add_to_logfile(logfile, f"Writing to FASTA database: {i} of {len(os.listdir(input_folder))} done.\n")
    print(f"Fasta file '{output_fasta}' has been created.")
    print(error_files)

def removing_gaps_in_sequences(removing_gaps_input_file,removing_gaps_output_file,logfile):
    with open(removing_gaps_input_file, 'r') as infile:
        num_seq = len(infile.readlines())/2
    with open(removing_gaps_input_file, 'r') as infile, open(removing_gaps_output_file, 'w') as outfile:
        header = None
        sequence = None
        i=0
        for line in infile.readlines():
            line = line.strip()
            
            if header is None:
                header = line
            else:
                sequence = line

            # Check if the sequence contains an 'X'
            if i%2 != 0 and 'X' not in sequence:
                # Write the header-sequence pair to the output file
                outfile.write(f"{header}\n{sequence}\n")

            # Reset header and sequence for the next pair
                header = None
                sequence = None
                add_to_logfile(logfile, f"Removing Gaps in Sequence {(i+1)/2} of {num_seq} done.\n")
            i+=1

def filtering_length_in_sequences(filtering_length_input_file,filtering_length_output_file,min_seq_length,max_seq_length,logfile):
    with open(filtering_length_input_file, 'r') as infile:
        num_seq = len(infile.readlines())/2
    with open(filtering_length_input_file, 'r') as infile, open(filtering_length_output_file, 'w') as outfile:
        header = None
        sequence = None
        i=0
        for line in infile.readlines():
            line2 = line.strip()
            
            if header is None:
                header = line2
            else:
                sequence = line2

            # Check if the sequence contains an 'X'
            if i%2 != 0 and len(sequence) > min_seq_length and len(sequence) < max_seq_length:
                # Write the header-sequence pair to the output file
                outfile.write(f"{header}\n{sequence}\n")

                # Reset header and sequence for the next pair
                header = None
                sequence = None
                add_to_logfile(logfile, f"Filtering Length in Sequence {(i+1)/2} of {num_seq} done.\n")
            i+=1

def copy_unique_pdbs_with_resolution_filter(copying_unique_pdbs_input_file,source_folder, output_folder,logfile):
    with open(copying_unique_pdbs_input_file, 'r') as infile:
        num_seq = len(infile.readlines())/2
    with open(copying_unique_pdbs_input_file, 'r') as infile2:
        i=0
        for line in infile2.readlines():
            line = line.strip()
            if line[0]==">":
                pdb_id = line[1:].split("-")[0]
                source_path=Path(source_folder).joinpath(f"{pdb_id}.pdb")
                parser = PDB.PDBParser(QUIET=True)
                structure = parser.get_structure('protein',source_path)
                try:
                    if structure.header['resolution'] < 4.0:
                        try:
                            shutil.copy2(source_path, output_folder)
                            # print(f"File copied from {source_path} to {output_folder}")
                        except FileNotFoundError:
                            print(f"Error: The file at {source_path} does not exist.")
                        except:
                            print(f"Error: Permission denied. Make sure you have the necessary permissions.")
                    else:
                        print(f"Resolution of {pdb_id} is {structure.header['resolution']}. Not copying file.")
                    
                except:
                    # add_to_logfile(logfile, f"Structure without resolution: {pdb_id}.\n")
                    import pdb; pdb.set_trace()
                    print("Exception in copying unique pdbs.")
                
                
            i+=1

def get_chain_sequence(chain):
    """ This function takes a chain object and returns the sequence of the chain as a string.
    Input: chain: a chain object
    return seq: a string"""
    seq =""
    for residue in chain:
        if is_aa(residue.get_resname(), standard = True):
            try:
                seq += three_to_one(residue.get_resname())
            except:
                seq += protein_letters_3to1[residue.get_resname()]
    return seq

# Dictionary that classifies ions and maps to the main atom
ion_classification = {
    'PO4': {'type': 'molecule', 'main_atom': 'P'},
    'SO4': {'type': 'molecule', 'main_atom': 'S'},
    'CL':  {'type': 'single atom', 'main_atom': 'CL'},
    'NO3': {'type': 'molecule', 'main_atom': 'N'},
    'CO3': {'type': 'molecule', 'main_atom': 'C'},
    'BCT': {'type': 'molecule', 'main_atom': 'C'},
    'LCP': {'type': 'molecule', 'main_atom': 'CL'},
    
    # Single atoms (metals and ions)
    'NA':  {'type': 'single atom', 'main_atom': 'NA'},
    'NH4': {'type': 'single atom', 'main_atom': 'N'},
    'K':   {'type': 'single atom', 'main_atom': 'K'},
    'CA':  {'type': 'single atom', 'main_atom': 'CA'},
    'MG':  {'type': 'single atom', 'main_atom': 'MG'},
    'ZN':  {'type': 'single atom', 'main_atom': 'ZN'},
    'FE':  {'type': 'single atom', 'main_atom': 'FE'},
    'NI':  {'type': 'single atom', 'main_atom': 'NI'},
    'MN':  {'type': 'single atom', 'main_atom': 'MN'},
    'CO':  {'type': 'single atom', 'main_atom': 'CO'},
    'FE2': {'type': 'single atom', 'main_atom': 'FE2'},
    'CD':  {'type': 'single atom', 'main_atom': 'CD'},
    'HG':  {'type': 'single atom', 'main_atom': 'HG'}
}


def get_closest_all_atoms_and_residues_and_indices_v3(pdb_struct, ref_atom, distance):
    """
    Returns:
      - atoms: Dictionary of atoms (keys) and their distances (values) from ref_atom.
      - closest_residues: List of residue objects that have at least one atom within the distance.
      - closest_residue_indices_dict: Dictionary with chain IDs as keys and a list of indices (only for standard amino acids) as values.
    """
    atoms = {}
    closest_residues = []
    closest_residue_indices_dict = {}
    rx, ry, rz = ref_atom.coord

    ref_residue = ref_atom.get_parent()  # Reference residue to exclude

    for chain in pdb_struct.get_chains():
        closest_residue_indices = []
        aa_index = 0  # Manual index counter for standard amino acids
        
        for residue in chain.get_residues():
            # Skip the reference residue
            if residue == ref_residue:
                if is_aa(residue, standard=True):
                    aa_index += 1
                continue

            is_standard = is_aa(residue, standard=True)
            # Check each atom in the residue:
            for atom in residue.get_atoms():
                if atom == ref_atom:
                    continue
                x, y, z = atom.coord        
                my_dist = math.sqrt((x - rx)**2 + (y - ry)**2 + (z - rz)**2)
                # Filter out waters and include any residue within the cutoff
                hetfield = atom.get_parent().get_id()[0]
                if my_dist < distance and hetfield != 'W':
                    # Compute spherical coordinates if needed:
                    r, theta, phi = get_r_theta_phi(atom, ref_atom)
                    atoms[atom] = r
                    closest_residues.append(residue)
                    if is_standard:
                        closest_residue_indices.append(aa_index)
                        break
            if is_standard:
                aa_index += 1
        closest_residue_indices_dict[chain.get_id()] = closest_residue_indices

    return atoms, closest_residues, closest_residue_indices_dict

def get_set_of_embeddings_at_binding_site_esm(model, alphabet, batch_converter,seq_data, indices_for_averaging):
    """ This function is going to take in a protein sequence and the indexes of the atoms involved in the binding site. It will return the 1280 dimensional numpy.
    Input: sequence: a string, indexes_for_averaging: a list of integers
    return avg_pooled: a 1280-dimensional numpy array averaged for the binding sites in this chain"""
    batch_labels, batch_strs, batch_tokens = batch_converter([(seq_data[0],seq_data[1])])
    batch_lens = (batch_tokens != alphabet.padding_idx).sum(1)
    with torch.no_grad():
        results = model(batch_tokens, repr_layers=[33], return_contacts=True)
    token_representations = results["representations"][33]
    set_of_tensors = []
    for i in indices_for_averaging:
        set_of_tensors.append(token_representations[0][i])
    return set_of_tensors

class Select_Residues(PDB.Select):
    def __init__ (self,selected_residues):
        self.target_residues = set(selected_residues)
    
    def accept_residue(self,residue):
        if residue in self.target_residues:
            return True
        else:
            return False
        
# def esm_embeddings_from_pkl_files(input_folder):
#     # Initialize lists to store separate variables
#     site_num, pdb_name, pdb_id, CN_atom, CN_residues, averaged_tensor_embedding = [], [], [], [], [], []

#     # Iterate through each file in the folder
#     for file_name in os.listdir(input_folder):
#         if file_name.endswith(".pkl"):
#             file_path = os.path.join(input_folder, file_name)
#             # Load data from pickle file
#             with open(file_path, "rb") as handle:
#                 pickle_data = pickle.load(handle)

#             # Extracting elements from pickle_data into separate lists
#             for item in pickle_data:
#                 site_num.append(item[0])
#                 pdb_name.append(item[1])
#                 pdb_id.append(item[2])
#                 CN_atom.append(item[3])
#                 CN_residues.append(item[4])
#                 averaged_tensor_embedding.append(item[5])

#     # Convert averaged_tensor_embedding to a NumPy array
#     embedded_data = np.array(averaged_tensor_embedding)

#     return embedded_data

# # Example usage
# #folder_path = "/Users/arunrajb/work/test/Outputs/Embeddings_data/Distance-7/"
# #embedded_data = esm_embeddings_from_pkl_files(input_folder)


# def plot_confusion_matrix(y_test, y_pred):
#     """
#     Generate and plot the confusion matrix.

#     Parameters:
#     - y_test: True labels from the test set.
#     - y_pred: Predicted labels from the model.

#     Returns:
#     - None
#     """
#     # Generate confusion matrix
#     conf_matrix = confusion_matrix(y_test, y_pred)

#     # Plot confusion matrix with increased font size
#     plt.figure(figsize=(8, 6), dpi=200)
#     heatmap = sns.heatmap(conf_matrix, annot=True, fmt='d', cmap='Blues',
#                           xticklabels=['Predicted 0', 'Predicted 1'],
#                           yticklabels=['Actual 1', 'Actual 0'],
#                           annot_kws={"size": 20})  # Increase font size to 20

#     # Set labels and title
#     plt.xlabel('Predicted')
#     plt.ylabel('Actual')
#     plt.title('Confusion Matrix')

#     # Increase x-axis and y-axis label font size
#     heatmap.set_xticklabels(heatmap.get_xticklabels(), fontsize=14)
#     heatmap.set_yticklabels(heatmap.get_yticklabels(), fontsize=14)

#     plt.show()

# # Example usage:
# # plot_confusion_matrix(y_test_fold, y_pred_fold)


# functions for ssCatPred

# def extract_list_from_pickle(file_path):
#     with open(file_path, 'rb') as file:
#         data_list = pickle.load(file)
#     return data_list

# def find_array_index(input_array, list_of_arrays):
#     """
#     Find the index of input_array in the list_of_arrays.

#     Parameters:
#         input_array (numpy.ndarray): The array to find in the list.
#         list_of_arrays (list): A list of numpy arrays.

#     Returns:
#         int: The index of input_array in list_of_arrays. Returns -1 if input_array is not found.
#     """
#     for index, array in enumerate(list_of_arrays):
#         if np.array_equal(input_array, array):
#             return index
#     return -1


# def get_structures_from_pdb(pdb_file_path):
#     """ This function takes a PDB file path and returns the PDB file as a structure.
#     return structure: a Bio.PDB.Structure object
#     """
#     parser = PDB.PDBParser(Quite=True)
#     structure = parser.get_structure('protein',pdb_file_path)
#     return structure

# def fetch_sequence_from_rcsb(pdb_id):
#     """ This function takes a PDB ID and returns the sequence from the RCSB website. Makes use of requests.get(rcsb_url).
#     return sequence_id, sequence: a tuple of strings"""
#     # Define the RCSB URL to fetch the PDB file in FASTA format
#     rcsb_url = f'https://www.rcsb.org/fasta/entry/{pdb_id}'
    
#     try:
#         # Send an HTTP GET request to the RCSB website
#         response = requests.get(rcsb_url)

#         # Check if the request was successful (status code 200)
#         if response.status_code == 200:
#             # Parse the FASTA data and extract the sequence
#             fasta_data = response.text
#             record = [string for string in fasta_data.split("\n") if string]
#             sequence_id = record[0]
#             sequence = record[1]
#             return sequence_id, sequence
#         else:
#             print(f"Failed to retrieve data for PDB ID: {pdb_id}")
#     except requests.exceptions.RequestException as e:
#         print(f"An error occurred while making the request: {e}")
        
# def fetch_sequence_from_rcsb2(pdb_id):
#     """ This function takes a PDB ID and returns the sequence from the RCSB website, except this returns the sequences of all the chains. Makes use of requests.get(rcsb_url).
#     return sequence_id, sequence: a tuple of strings"""
#     # Define the RCSB URL to fetch the PDB file in FASTA format
#     rcsb_url = f'https://www.rcsb.org/fasta/entry/{pdb_id}'
#     sequence_id=[]
#     sequence =[]
#     try:
#         # Send an HTTP GET request to the RCSB website
#         response = requests.get(rcsb_url)

#         # Check if the request was successful (status code 200)
#         if response.status_code == 200:
#             # Parse the FASTA data and extract the sequence
#             fasta_data = response.text
#             record = [string for string in fasta_data.split("\n") if string]
#             nchains=int(len(record)/2)
#             for i in range(0,len(record),2):
#                 sequence_id.append(record[i])
#                 sequence.append(record[i+1])
#             return sequence_id, sequence
#         else:
#             print(f"Failed to retrieve data for PDB ID: {pdb_id}")
#     except requests.exceptions.RequestException as e:
#         print(f"An error occurred while making the request: {e}")


# def cart2sph(x,y,z):
#     """ This function takes cartesian coordinates and returns spherical coordinates.
#     return r, elev, az: floats"""
#     XsqPlusYsq = x**2 + y**2
#     r = m.sqrt(XsqPlusYsq + z**2)               # r
#     elev = m.atan2(z,m.sqrt(XsqPlusYsq))     # theta
#     az = m.atan2(y,x)                           # phi
#     return r, elev, az


# def prot3to1(resname):
#     """ This function takes a residue name and returns the corresponding amino acid sequence. Makes use of protein_letters_3to1.
#     return string: a string"""
#     string = protein_letters_3to1[resname.capitalize()]
#     return string


# def get_file(filename,aliasname):
#     """ This function takes a PDB file path and returns the PDB file as a structure.
#     return structure: a Bio.PDB.Structure object
#     """
#     repository = PDB.PDBList()
#     parser = PDB.PDBParser()
    
#     structure = parser.get_structure(aliasname, filename)
#     return structure


# def get_closest_atoms(pdb_struct, ref_atom, distance):
#     """ This function takes a PDB structure and a reference atom and returns the closest atoms to the reference atom.
#     return atoms: a dictionary of closest atoms"""
#     atoms = {}
#     rx, ry, rz = ref_atom.coord
#     for atom in pdb_struct.get_atoms():
#         if atom == ref_atom:
#             continue
        
#         x, y, z = atom.coord        
#         my_dist = math.sqrt((x - rx)**2 + (y - ry)**2 + (z - rz)**2)
#         if my_dist < distance:
#             atoms[atom] = my_dist
#     return atoms

# def get_closest_atoms_phi_sort(pdb_struct, ref_atom, distance):
#     """ This function takes a PDB structure and a reference atom and returns the closest atoms to the reference atom.
#     return atoms: a dictionary of closest atoms"""
#     atoms = {}
#     rx, ry, rz = ref_atom.coord
#     for atom in pdb_struct.get_atoms():
#         if atom == ref_atom:
#             continue
        
#         x, y, z = atom.coord        
#         my_dist = math.sqrt((x - rx)**2 + (y - ry)**2 + (z - rz)**2)
#         if my_dist < distance and atom.get_full_id()[3][0]==' ':
#             r, theta, phi = get_r_theta_phi(atom,ref_atom)
#             atoms[atom] = phi
#     return atoms

def vecdist(atom1, atom2):
    """ This function takes two atoms and returns the vector distance between them.
    return my_dist: float"""
    r1x, r1y, r1z = atom1.coord
    r2x, r2y, r2z = atom2.coord
    my_dist = math.sqrt((r1x-r2x)**2+(r1y-r2y)**2+(r1z-r2z)**2)
    return my_dist

def veclength(x,y,z):
    """ This function takes a vector and returns the vector length.
    return my_dist: float"""
    my_dist = math.sqrt((x)**2+(y)**2+(z)**2)
    return my_dist

def get_r_theta_phi(atom1,ref_atom):
    """ This function takes two atoms and returns the r, theta, and phi of the vector connecting the two atoms.
    return r, theta, phi: floats"""
    xnew, ynew, znew = atom1.coord - ref_atom.coord
    r = veclength(xnew,ynew,znew)
    theta = np.arccos(znew/r)
    phi = np.sign(ynew)*np.arccos(xnew/math.sqrt(xnew**2+ynew**2))
    return r, theta, phi    

def get_spherical_coords(closestatoms,ref_atom):
    """ This function takes a list of closestatoms and a reference atom and returns the spherical coordinates of the closest O, N atoms with respect to the ref_atom.
    return atomlist,r_store,theta_store,phi_store: list, list, list, list"""
    r_store=[]
    theta_store=[]
    phi_store= []
    atomlist =[]
    for each in closestatoms:
        if each.element == "O" or each.element =="N":
            r,theta,phi = get_r_theta_phi(each,ref_atom)
            r_store.append(r)
            theta_store.append(theta)
            phi_store.append(phi)
            atomlist.append(each)
    return atomlist,r_store,theta_store,phi_store
        
def get_cartesian_coords(closestatoms,ref_atom):
    """ This function takes a list of closestatoms and a reference atom and returns the cartesian coordinates of the closest w.r.t. the ref_atom.
    return atomlist,xlist,ylist,zlist: list, list, list, list"""
    xlist,ylist,zlist = [],[],[]
    atomlist =[]
    for each in closestatoms:
        if each.element == "O" or each.element == "N":
            x,y,z = each.coord - ref_atom.coord
            xlist.append(x)
            ylist.append(y)
            zlist.append(z)
            atomlist.append(each)
    return atomlist,xlist,ylist,zlist
        
  
def get_cartesian_coords_com(closestatoms,ref_atom):
    xlist,ylist,zlist = [],[],[]
    atomlist =[]
    for each in closestatoms:
        if each.element == "O" or each.element == "N":
            x,y,z = each.coord - ref_atom.coord
            xlist.append(x)
            ylist.append(y)
            zlist.append(z)
            atomlist.append(each)
    x_com = np.mean(xlist)
    y_com = np.mean(ylist)
    z_com = np.mean(zlist)
    xl = [x-x_com for x in xlist]     
    yl = [y-y_com for y in ylist]     
    zl = [z-z_com for z in zlist]     
            
    return atomlist,xl,yl,zl


def histshow(listname):
    """ This function takes a list and returns a histogram of the list.
    return listname: list"""
    plt.figure()    
    nc = len(set(listname))
    plt.hist(listname,rwidth = 0.9, bins = nc)
    plt.xticks(np.linspace(0, nc-1, 2*nc+1)[1::2])
    
    
def partial_procrustes_method(A, B, scale):
    """ This function takes two sets of coordinates and returns the rotation matrix, scale factor, and translation vector.
    return c, R, t: floats"""
    assert len(A) == len(B)

    N = A.shape[0];  # total points

    centroid_A = np.mean(A, axis=0)
    centroid_B = np.mean(B, axis=0)

    # center the points
    AA = A - np.tile(centroid_A, (N, 1))
    BB = B - np.tile(centroid_B, (N, 1))

    # dot is matrix multiplication for array
    if scale:
        H = np.transpose(BB) * AA / N
    else:
        H = np.transpose(BB) * AA

    U, S, Vt = np.linalg.svd(H)

    R = Vt.T * U.T


    if scale:
        varA = np.var(A, axis=0).sum()
        c = 1 / (1 / varA * np.sum(S))  # scale factor
        t = -R * (centroid_B.T * c) + centroid_A.T
    else:
        c = 1
        t = -R * centroid_B.T + centroid_A.T

    return c, R, t

def get_closest_polar_atoms(pdb_struct, ref_atom, distance):
    """ This function takes a PDB structure and a reference atom and returns the closest atoms to the reference atom.
    return atoms: a dictionary of closest atoms"""
    atoms = {}
    rx, ry, rz = ref_atom.coord
    for atom in pdb_struct.get_atoms():
        if atom == ref_atom:
            continue
        
        x, y, z = atom.coord        
        my_dist = math.sqrt((x - rx)**2 + (y - ry)**2 + (z - rz)**2)
        if my_dist < distance and atom.get_full_id()[3][0]==' ' and (atom.element == "O" or atom.element == "N"):
            r, theta, phi = get_r_theta_phi(atom,ref_atom)
            atoms[atom] = r
    return atoms


def get_3dthetamatrix(xyz0,xyzlist):
    """ This function takes a list of 3 xyz coordinates plus a reference xyz0, and returns the list of pairwise-theta for thr 3 coordinates.
    return d1, t12, t13, d2, t23, d3: floats"""
    d1 = measure_distance(xyz0,xyzlist[0])
    d2 = measure_distance(xyz0,xyzlist[1])
    d3 = measure_distance(xyz0,xyzlist[2])
    t12 = measure_theta(xyz0,xyzlist[0],xyzlist[1])
    t23 = measure_theta(xyz0,xyzlist[1],xyzlist[2])
    t13 = measure_theta(xyz0,xyzlist[0],xyzlist[2])    
    return d1,t12,t13, d2,t23,d3

def get_4dthetamatrix(xyz0,xyzlist):
    """ This function takes a list of 4 xyz coordinates plus a reference xyz0, and returns the list of pairwise-theta for thr 4 coordinates.
    return d1, t12, t13, t14, d2, t23, t24, d3, t34, d4: floats"""
    d1 = measure_distance(xyz0,xyzlist[0])
    d2 = measure_distance(xyz0,xyzlist[1])
    d3 = measure_distance(xyz0,xyzlist[2])
    d4 = measure_distance(xyz0,xyzlist[3])
    t12 = measure_theta(xyz0,xyzlist[0],xyzlist[1])
    t23 = measure_theta(xyz0,xyzlist[1],xyzlist[2])
    t34 = measure_theta(xyz0,xyzlist[2],xyzlist[3])
    t24 = measure_theta(xyz0,xyzlist[1],xyzlist[3])
    t14 = measure_theta(xyz0,xyzlist[0],xyzlist[3])
    t13 = measure_theta(xyz0,xyzlist[0],xyzlist[2])    
    
    return d1,t12,t13,t14,d2,t23,t24, d3,t34, d4

def get_5dthetamatrix(xyz0,xyzlist):
    """ This function takes a list of 5 xyz coordinates plus a reference xyz0, and returns the list of pairwise-theta for thr 5 coordinates.
    return d1, t12, t13, t14, t15, d2, t23, t24, t25, d3, t34, t35, d4, t45, d5: floats"""
    d1,d2,d3,d4,d5 = [measure_distance(xyz0,xyzlist[i]) for i in range(len(xyzlist))]
    # t12 = [measure_theta(xyz0,xyzlist[i],xyzlist[j]) for i in range(len(xyzlist)-1) for j in range(i+1, len(xyzlist))]
    t12 = measure_theta(xyz0,xyzlist[1],xyzlist[2])
    t13 = measure_theta(xyz0,xyzlist[0],xyzlist[2])    
    t14 = measure_theta(xyz0,xyzlist[0],xyzlist[3])
    t15 = measure_theta(xyz0,xyzlist[0],xyzlist[4])
    t23 = measure_theta(xyz0,xyzlist[1],xyzlist[2])
    t24 = measure_theta(xyz0,xyzlist[1],xyzlist[3])
    t25 = measure_theta(xyz0,xyzlist[1],xyzlist[4])
    t34 = measure_theta(xyz0,xyzlist[2],xyzlist[3])
    t35 = measure_theta(xyz0,xyzlist[2],xyzlist[4])
    t45 = measure_theta(xyz0,xyzlist[3],xyzlist[4])
    
    return d1, t12, t13, t14, t15, d2, t23, t24, t25, d3, t34, t35, d4, t45, d5

def get_6dthetamatrix(xyz0,xyzlist):
    """ This function takes a list of 6 xyz coordinates plus a reference xyz0, and returns the list of pairwise-theta for thr 6 coordinates.
    return d1, t12, t13, t14, t15, t16, d2, t23, t24, t25, t26, d3, t34, t35, t36, d4, t45, t46, d5, t56, d6: floats"""
    d1 = measure_distance(xyz0,xyzlist[0])
    d2 = measure_distance(xyz0,xyzlist[1])
    d3 = measure_distance(xyz0,xyzlist[2])
    d4 = measure_distance(xyz0,xyzlist[3])
    d5 = measure_distance(xyz0,xyzlist[4])
    d6 = measure_distance(xyz0,xyzlist[5])
    t12 = measure_theta(xyz0,xyzlist[0],xyzlist[1])
    t13 = measure_theta(xyz0,xyzlist[0],xyzlist[2])    
    t14 = measure_theta(xyz0,xyzlist[0],xyzlist[3])
    t15 = measure_theta(xyz0,xyzlist[0],xyzlist[4])
    t16 = measure_theta(xyz0,xyzlist[0],xyzlist[5])
    t23 = measure_theta(xyz0,xyzlist[1],xyzlist[2])
    t24 = measure_theta(xyz0,xyzlist[1],xyzlist[3])
    t25 = measure_theta(xyz0,xyzlist[1],xyzlist[4])
    t26 = measure_theta(xyz0,xyzlist[1],xyzlist[5])
    t34 = measure_theta(xyz0,xyzlist[2],xyzlist[3])
    t35 = measure_theta(xyz0,xyzlist[2],xyzlist[4])
    t36 = measure_theta(xyz0,xyzlist[2],xyzlist[5])
    t45 = measure_theta(xyz0,xyzlist[3],xyzlist[4])
    t46 = measure_theta(xyz0,xyzlist[3],xyzlist[5])
    t56 = measure_theta(xyz0,xyzlist[4],xyzlist[5])
    
    return d1, t12, t13, t14, t15, t16, d2, t23, t24, t25, t26, d3, t34, t35, t36, d4, t45, t46, d5, t56, d6

def measure_distance(xyz0,xyzlist):
    """ This function measures the distance between two xyz coordinates- xyz0 and xyzlist.
    return dist: float"""
    dist = math.sqrt((xyz0[0]-xyzlist[0])**2 + (xyzlist[1]-xyz0[1])**2 + (xyz0[2]-xyzlist[2])**2)
    return dist

def measure_theta(xyz0,xyzlist1,xyzlist2):
    """ This function measures the angle formed by two xyz coordinates- xyzlist1 and xyzlist2, with xyz0 being the vertex.
    return angle: float"""
    v1 = xyz0 - xyzlist1
    v2 = xyz0 - xyzlist2
    angle = measure_angle(v1,v2)
    return angle

def measure_angle(v1,v2):
    """Returns the angle in radians between vectors 'v1' and 'v2'"""
    v1_u = v1 / np.linalg.norm(v1)
    v2_u = v2 / np.linalg.norm(v2)
    return np.arccos(np.clip(np.dot(v1_u, v2_u), -1.0, 1.0))


def cosine_similarity(a, b):
    """Returns the cosine similarity between two arrays a and b"""
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    return dot_product / (norm_a * norm_b)

def pairwise_cosine_similarity(arrays):
    """Returns a matrix of pairwise cosine similarities between arrays in a list"""
    n = len(arrays)
    similarities = np.zeros((n, n))
    for i in range(n):
        for j in range(i+1, n):
            similarities[i][j] = cosine_similarity(arrays[i], arrays[j])
            similarities[j][i] = similarities[i][j]
    return similarities

import inspect

def get_closest_residues(pdb_struct, ref_atom, distance):
    """ This function takes a PDB structure and a reference atom and returns the closest atoms to the reference atom.
    return atoms: a dictionary of closest atoms"""
    atoms = {}
    closest_residues = []
    rx, ry, rz = ref_atom.coord
    closest_residue_indices = []
    closest_residue_indices_dict = {}
    for chain in pdb_struct.get_chains():
        for i,residue in enumerate(pdb_struct.get_residues()):
            for atom in residue.get_atoms():
                if atom == ref_atom:
                    continue
                x, y, z = atom.coord        
                my_dist = math.sqrt((x - rx)**2 + (y - ry)**2 + (z - rz)**2)
                if my_dist < distance and atom.get_full_id()[3][0]==' ' and (atom.element == "O" or atom.element == "N"):
                    r, theta, phi = get_r_theta_phi(atom,ref_atom)
                    atoms[atom] = r
                    closest_residues.append(atom.get_parent())
                    
    return atoms, closest_residues


def get_closest_polar_atoms_and_residues_and_indices(pdb_struct, ref_atom, distance):
    """ This function takes a PDB structure and a reference atom and returns the closest atoms to the reference atom in list called atoms. It'll also return a list of residue objects that contribute the closest atoms to the reference atom in the list called closest_residues.
    Finally, it'll also return a dictionary of residue indices that contribute the closest atoms to the reference atom. The indexes are the indices of the residues in the sequence of the protein.
    
    Input: pdb_struct: a PDB structure object, ref_atom: an atom object, distance: a float
    return atoms, closest_residues, closest_residue_indices_dict"""
    atoms = {}
    closest_residues = []
    rx, ry, rz = ref_atom.coord
    
    closest_residue_indices_dict = {}
    for chain in pdb_struct.get_chains():
        closest_residue_indices = []
        i=0
        for residue in chain.get_residues():
            for atom in residue.get_atoms():
                if atom == ref_atom:
                    continue
                x, y, z = atom.coord        
                my_dist = math.sqrt((x - rx)**2 + (y - ry)**2 + (z - rz)**2)
                if my_dist < distance and atom.get_full_id()[3][0]==' ' and (atom.element == "O" or atom.element == "N") and is_aa(atom.get_parent().get_resname())==True:
                    r, theta, phi = get_r_theta_phi(atom,ref_atom)
                    atoms[atom] = r
                    closest_residues.append(atom.get_parent())
                    closest_residue_indices.append(i)
            if is_aa(residue.get_resname(),standard=True)==True:
                    i+= 1
        closest_residue_indices_dict[chain.get_id()] = closest_residue_indices
    return atoms, closest_residues, closest_residue_indices_dict

def get_closest_polar_atoms_and_residues_and_indices_for_ProteinMPNN(pdb_struct, ref_atom, distance):
    """ The previous function copied here and used with modification of i=1 due to number mismatch while using ProteinMPNN sequences. Starting residue number for feature extraction is 0 but ProteinMPNN need 1 """
    atoms = {}
    closest_residues = []
    rx, ry, rz = ref_atom.coord
    
    closest_residue_indices_dict = {}
    for chain in pdb_struct.get_chains():
        closest_residue_indices = []
        i=1
        for residue in chain.get_residues():
            for atom in residue.get_atoms():
                if atom == ref_atom:
                    continue
                x, y, z = atom.coord        
                my_dist = math.sqrt((x - rx)**2 + (y - ry)**2 + (z - rz)**2)
                if my_dist < distance and atom.get_full_id()[3][0]==' ' and (atom.element == "O" or atom.element == "N") and is_aa(atom.get_parent().get_resname())==True:
                    r, theta, phi = get_r_theta_phi(atom,ref_atom)
                    atoms[atom] = r
                    closest_residues.append(atom.get_parent())
                    closest_residue_indices.append(i)
            if is_aa(residue.get_resname(),standard=True)==True:
                    i+= 1
        closest_residue_indices_dict[chain.get_id()] = closest_residue_indices
    return atoms, closest_residues, closest_residue_indices_dict



def find_binding_residue_indexes(input_string):
    """ This function works by looking for the asterik or star (*) in a string. This is because the residues involved in the binding site are not the same as the residues involved in the binding site are replaced by the asterik sign. """
    return [index for index, char in enumerate(input_string) if char == '*']

def replace_last_char_with_star(input_string):
    """ This function replaces the last character in a string with an asterik or star (*)."""
    if len(input_string) > 0:
        modified_string = input_string[:-1] + '*'
        return modified_string
    else:
        return input_string

# Function to convert protein sequence to ESM-2 embedding
def embed_protein_sequence(model, alphabet, batch_converter,seq_data):
    
    """ This function is going to take in a protein sequence and the indexes of the atoms involved in the binding site. It will return the 768 dimensional numpy.
    Input: sequence: a string, indexes_for_averaging: a list of integers
    return avg_pooled: a 768-dimensional numpy array averaged for the binding sites in this chain"""
    batch_labels, batch_strs, batch_tokens = batch_converter([(seq_data[0],seq_data[1])])
    batch_lens = (batch_tokens != alphabet.padding_idx).sum(1)
    with torch.no_grad():
        results = model(batch_tokens, repr_layers=[33], return_contacts=True)
    token_representations = results["representations"][33][0]
    return token_representations

def get_set_of_embeddings_at_binding_site(model, alphabet, batch_converter,seq_data, indices_for_averaging):
    """ This function is going to take in a protein sequence and the indexes of the atoms involved in the binding site. It will return the 768 dimensional numpy.
    Input: sequence: a string, indexes_for_averaging: a list of integers
    return avg_pooled: a 768-dimensional numpy array averaged for the binding sites in this chain"""
    batch_labels, batch_strs, batch_tokens = batch_converter([(seq_data[0],seq_data[1])])
    batch_lens = (batch_tokens != alphabet.padding_idx).sum(1)
    with torch.no_grad():
        results = model(batch_tokens, repr_layers=[33], return_contacts=True)
    token_representations = results["representations"][33][0]
    set_of_tensors = []
    for i in indices_for_averaging:
        set_of_tensors.append(token_representations[i])
    return set_of_tensors


def get_functions_with_description_to_file(filename):
    functions = inspect.getmembers(inspect.getmodule(inspect.currentframe()), inspect.isfunction)
    with open(filename, 'w') as file:
        for function in functions:
            print(f"Function: {function[0]}", file=file)
            print(f"Description: {function[1].__doc__}\n", file=file)
    print("Updated the description file")




# Define the MLP model
class MLP(nn.Module):
    def __init__(self, input_size, hidden_size1, hidden_size2, hidden_size3, output_size, dropout_rate):
        super(MLP, self).__init__()
        self.fc1 = nn.Linear(input_size, hidden_size1)
        self.bn1 = nn.BatchNorm1d(hidden_size1)
        self.relu = nn.ReLU()
        self.dropout1 = nn.Dropout(dropout_rate)

        self.fc2 = nn.Linear(hidden_size1, hidden_size2)
        self.bn2 = nn.BatchNorm1d(hidden_size2)
        self.dropout2 = nn.Dropout(dropout_rate)

        self.fc3 = nn.Linear(hidden_size2, hidden_size3)
        self.bn3 = nn.BatchNorm1d(hidden_size3)
        self.dropout3 = nn.Dropout(dropout_rate)

        self.fc4 = nn.Linear(hidden_size3, output_size)  # raw logits output

    def forward(self, x):
        out = self.fc1(x)
        out = self.bn1(out)
        out = self.relu(out)
        out = self.dropout1(out)

        out = self.fc2(out)
        out = self.bn2(out)
        out = self.relu(out)
        out = self.dropout2(out)

        out = self.fc3(out)
        out = self.bn3(out)
        out = self.relu(out)
        out = self.dropout3(out)

        out = self.fc4(out)  # no activation here
        return out


# Function to get set of embeddings at binding site using ESM model
def get_set_of_embeddings_at_binding_site_esm(model, alphabet, batch_converter, seq_data, indices_for_averaging):
    batch_labels, batch_strs, batch_tokens = batch_converter([(seq_data[0], seq_data[1])])
    batch_lens = (batch_tokens != alphabet.padding_idx).sum(1)
    with torch.no_grad():
        results = model(batch_tokens, repr_layers=[33], return_contacts=True)
    token_representations = results["representations"][33]
    set_of_tensors = []
    for i in indices_for_averaging:
        set_of_tensors.append(token_representations[0][i])
    return set_of_tensors

# Function to preprocess the protein sequence and important residues
def preprocess_sequence(sequence, important_residues, esm_model, alphabet, batch_converter):
    set_of_embeddings = get_set_of_embeddings_at_binding_site_esm(esm_model, alphabet, batch_converter, ('protein', sequence), important_residues)
    avg_embedding = torch.mean(torch.stack(set_of_embeddings), dim=0)
    return avg_embedding.numpy()

# Function to load the model
def load_model(model_path):
    model = MLP(input_size=1280, hidden_size1=600, hidden_size2=300, hidden_size3=100, output_size=1, dropout_rate=0.3)
    model.load_state_dict(torch.load(model_path))
    model.eval()
    return model

# Function to predict phosphate binding site
def predict_binding_site(sequence, important_residues, model, esm_model, alphabet, batch_converter):
    processed_sequence = preprocess_sequence(sequence, important_residues, esm_model, alphabet, batch_converter)
    input_tensor = torch.tensor(processed_sequence, dtype=torch.float32).unsqueeze(0)
    with torch.no_grad():
        output = model(input_tensor)
        output = output.item()  

    positive_confidence = round(output, 4)  
    negative_confidence = round(output, 4)

    # Binary prediction using the 0.5 cutoff
    prediction = int(output >= 0.5)
    return prediction, positive_confidence, negative_confidence

def process_fasta(fasta_file, model, esm_model, alphabet, batch_converter, important_residues):
    """Process multiple sequences from a fasta file and predict binding sites."""
    results = []
    highest_confidence = -1  # To keep track of the highest confidence
    highest_confidence_index = -1  # To store the index with the highest confidence

    # Read sequences from the .fasta file
    for idx, record in enumerate(SeqIO.parse(fasta_file, "fasta")):
        protein_sequence = str(record.seq)

        # Predict binding site for the current sequence
        contains_binding_site, positive_confidence, negative_confidence = predict_binding_site(
            protein_sequence, important_residues, model, esm_model, alphabet, batch_converter)
        
        # Check if the current sequence has the highest positive confidence
        if positive_confidence > highest_confidence:
            highest_confidence = positive_confidence
            highest_confidence_index = idx
        
        # Save the result for this sequence
        result = {
            'index': idx,
            'sequence_id': record.id,
            'contains_binding_site': contains_binding_site,
            'positive_confidence': positive_confidence,
            'negative_confidence': negative_confidence
        }
        results.append(result)
    
    return results, highest_confidence_index, highest_confidence

def get_closest_all_atoms_and_residues_and_indices(pdb_struct, ref_atom, distance):
    """
    Returns:
      - atoms: Dictionary of atoms (keys) and their distances (values) from ref_atom.
      - closest_residues: List of residue objects that have at least one atom within the distance.
      - closest_residue_indices_dict: Dictionary with chain IDs as keys and a list of indices (only for standard amino acids) as values.
    """
    atoms = {}
    closest_residues = []
    closest_residue_indices_dict = {}
    rx, ry, rz = ref_atom.coord

    ref_residue = ref_atom.get_parent()  # Reference residue to exclude

    for chain in pdb_struct.get_chains():
        closest_residue_indices = []
        aa_index = 0  # Manual index counter for standard amino acids
        
        for residue in chain.get_residues():
            is_standard = is_aa(residue, standard=True)
            # Check each atom in the residue:
            for atom in residue.get_atoms():
                if atom == ref_atom:
                    continue
                x, y, z = atom.coord        
                my_dist = math.sqrt((x - rx)**2 + (y - ry)**2 + (z - rz)**2)
                # The condition atom.get_full_id()[3][0]==' ' filters for standard residues.
                hetfield = atom.get_parent().get_id()[0]
                if my_dist < distance and hetfield != 'W':
                    # Compute spherical coordinates if needed:
                    r, theta, phi = get_r_theta_phi(atom, ref_atom)
                    atoms[atom] = r
                    closest_residues.append(residue)
                    if is_standard:
                        closest_residue_indices.append(aa_index)
                    # Once a close atom is found in a residue, stop checking further atoms:
                    break
            if is_standard:
                aa_index += 1
        closest_residue_indices_dict[chain.get_id()] = closest_residue_indices

    return atoms, closest_residues, closest_residue_indices_dict



