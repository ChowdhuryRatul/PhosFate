################################   ################################
# Usage: python Database_creation.py --output_folder_location Data --ion_symbols PO4 --ion_names Phosphate --starting_step Zero --logfile "splitting-ions.log" [other options]
################################################################

#------------------------------------------------------------------
""" Import all the required modules and libraries and functions in this section of the script.
     """
import os
import sys
import argparse
import requests
from pathlib import Path
from Bio.PDB import PDBParser, PDBIO
sys.path.append("../Utils")
from phosfate_utils import *

def create_parser():
    parser = argparse.ArgumentParser(
        description="Downnload, and filter the PDB files from the RCBS PDB database"
        )
    parser.add_argument(
        "--ion_symbols",
        type=str,
        required=False,
        help="In case of multi-ion mode, specify the list of ions you want to plot. Default is just K.",
        )
    parser.add_argument(
        "--input_file",
        type=str,
        default=None,
        required=False,
        help="Load the arguments from this input file",
        )
    parser.add_argument(
        "--ion_names",
        type=str,
        required=False,
        help="Specify ion name in a list. Default is just Potassium",
        )
    parser.add_argument(
        "--output_folder_location",
        type=str,
        required=True,
        help="Specify location where to save the PDBs folder",
        )
    parser.add_argument(
        "--starting_step",
        type=str,
        required=True,
        default="Zero",
        choices=["Zero","Splitting","CreatingFastaFile","MMSeqs","Copying_files"],
        help="Specify which step to start from",
        )
    parser.add_argument(
        "--logfile",
        type=str,
        required=False,
        default="logfile.log",
        help="Specofy which step to start from",
        )
    parser.add_argument(
        "--min_seq_length",
        type=int,
        required=False,
        default=20,
        help="Specify minimum sequence length to keep in the fasta file",
        )
    parser.add_argument(
        "--max_seq_length",
        type=int,
        required=False,
        default=1024,
        help="Specify maximum sequence length to keep in the fasta file",
        )
    
    return parser

def parse_arguments_from_file(file_path):
    with open(file_path, 'r') as file:
        lines = file.readlines()

    arguments = [line.strip().split() for line in lines]
    return sum(arguments, [])  # flatten the list
def main():
     #-------------------------------------------------------------------------
    # Specify the output folder where PDB files will be saved  
     parser = create_parser()
     args = parser.parse_args()
     if all(value is None for value in vars(args).values()):
          print("Usage: python database_creation.py --output_folder_location Data --ion_symbols K,NA --ion_names Potassium,Ammonium [other options]")
          exit()
     if args.input_file:
          file_arguments = parse_arguments_from_file(args.input_file)
          # Override default values with arguments from the file
          for arg in vars(args):
               file_value = [file_arguments[i + 1] for i, val in enumerate(file_arguments) if val == f'--{arg}']
               if file_value:
                    setattr(args, arg, file_value[0])
     required_arguments = ["ion_symbols", "ion_names", "output_folder_location", "logfile"]
     for argument in required_arguments:
          if argument not in vars(parser.parse_args()) or not vars(parser.parse_args()).get(argument):
               raise ValueError(f"--{argument} is a required argument. Please provide it in the text file.")
     #X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-

     #-------------------------------------------------------------------------
     output_folder_location = args.output_folder_location.split(",")[0]
     mmseqs_folder_path = f"../{output_folder_location}/MMSeqs"
     check_dir(mmseqs_folder_path)
     #X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-

     #-------------------------------------------------------------------------
     ion_names_in_a_list = []
     ion_symbols_in_a_list = []
     for ion_name,ion_symbol in zip(args.ion_names.split(","),args.ion_symbols.split(",")):
          ion_names_in_a_list.append(ion_name)
          ion_symbols_in_a_list.append(ion_symbol)

     for ion_name,ion_symbol in zip(ion_names_in_a_list,ion_symbols_in_a_list):
          downloaded_pdbs_output_folder = f"../{output_folder_location}/DownloadedPDBs/{ion_name}PDBsFolder/"
          check_dir(downloaded_pdbs_output_folder)

          split_chains_output_folder = Path(f"../{output_folder_location}/Splitting-Chains-Step/{ion_name}-All-Chain-PDBs/")
          check_dir(split_chains_output_folder)

          mmseqs_output_folder = Path(f"{mmseqs_folder_path}/{ion_name}")
          check_dir(mmseqs_output_folder)
     #X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-
          
     
#----------------------------------------------------------------
          """ Step 1: Start by running the RCSB API to download the PDB files containing particular ion of interest. Save the PDB files in a folder called f"./Outputs/Step1-{ion_name}-All-PDB-Files"

          """

          if args.starting_step == "Zero":              
               download_pdb_with_ion(ion_symbol, downloaded_pdbs_output_folder)
#X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-


#----------------------------------------------------------------
          """ Step 2: Run a script to separate the chains in the PDB files into individual PDB files and generate sequences for all those chains. 
          Save the resulting PDB files in a folder called f"{ion_name}-All-Chain-PDBs" in the (f"./Outputs/Step2-{ion_name}-Split-Chains") directory.
          Also, save all the sequences in a fasta file called f"{ion_name}-Database-All-Chain-Sequence.fasta" in the (f"./Outputs/Step2-{ion_name}-Split-Chains") directory. This fasta file should be formatted as follows:
          > <PDBID>-chain-<chain_id>
          MASQRTASDERYRRQ
          > <PDBID>-chain-<chain_id>
          MASQRTASDERYRRQ
          
          """  
          import os
          list_of_files = os.listdir(downloaded_pdbs_output_folder)
          address_to_pdb_files = [os.path.join(downloaded_pdbs_output_folder, pdb_file_name) for pdb_file_name in list_of_files]
          if args.starting_step == "Splitting" or args.starting_step == "Zero":
               with open(args.logfile, "w") as file:
                    print(f"Starting step {args.starting_step}...", file=file)                
               for i,item in enumerate(address_to_pdb_files):
                    structure = PDBParser().get_structure(Path(item).stem, item)
                    split_chains_and_save(structure, split_chains_output_folder, Path(item))
                    if i % 100 == 0:
                         with open(args.logfile, "a") as file:
                              print(f"Splitting {ion_name}, completed {i}/{len(address_to_pdb_files)}", file=file)

          

#X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-

#----------------------------------------------------------------------
          """ Step 3: Run a script to create the sequence database .fasta file for use with MMSeqs in the next step.
          """

          input_folder_for_creating_fasta_database = split_chains_output_folder
          output_fasta = Path(mmseqs_output_folder).joinpath(f"{ion_name}-all-chains-B.fasta")
          if args.starting_step == "Splitting" or args.starting_step == "Zero" or args.starting_step == "CreatingFastaFile":
               write_to_fasta_file(input_folder_for_creating_fasta_database, output_fasta,args.logfile)

#----------------------------------------------------------------
          """ Step 3: Run a script to perform MMSeqs2 lin-clust on the f"{ion_name}-Database-All-Chain-Sequence.fasta" fasta file and save the resulting clusters in a folder called "clusterRes_rep_seq.fasta" in the (f"./Outputs/Step3-{ion_name}-MMSeqs2") directory.
               source for MMSeqs conditions : https://www.science.org/doi/suppl/10.1126/science.ade2574/suppl_file/science.ade2574_sm.pdf
          """
          if args.starting_step == "Splitting" or args.starting_step == "Zero" or args.starting_step == "CreatingFastaFile" or args.starting_step == "MMSeqs":
               check_dir(mmseqs_output_folder)
               os.system(f"mmseqs easy-linclust {mmseqs_output_folder}/{ion_name}-all-chains-B.fasta {mmseqs_output_folder}/{ion_name}-clusterRes tmp") #####  NOTE: This will create an output file called "clusterRes_rep_seq.fasta" in the                mmseqs_output_folder = Path(f"{mmseqs_folder_path}/{ion_name}")  directory.

     #mmseqs easy-linclust /work/ratul1/arunraj/phospred_work/Data3/MMSeqs/Biarbonate/Biarbonate-all-chains-B.fasta /work/ratul1/arunraj/phospred_work/Data3/MMSeqs/Biarbonate/Biarbonate-all-clusterRes tmp
#X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-

#----------------------------------------------------------------------
          """ Step 4: Run a script to read the "clusterRes_rep_seq.fasta" fasta file the (f"./Outputs/Step3-{ion_name}-MMSeqs2") directory and filter out the sequences that contain a gap in their sequence (given by an "X"). This is done because ESM cannot generate representations for sequences containing "X" in their sequence.
               """
          removing_gaps_input_file = Path(mmseqs_output_folder).joinpath(f"{ion_name}-clusterRes_rep_seq.fasta")
          removing_gaps_output_file = Path(mmseqs_output_folder).joinpath(f"{ion_name}-clusterRes_rep_seq-without_gaps.fasta")
          if args.starting_step == "Splitting" or args.starting_step == "Zero" or args.starting_step == "CreatingFastaFile" or args.starting_step == "MMSeqs" or args.starting_step == "removing_gaps":
               removing_gaps_in_sequences(removing_gaps_input_file,removing_gaps_output_file,args.logfile)
               
#X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-


#-------------------------------------------------------------------------
          """ Step 5: Run a script to filter out the sequences longer than 1024  amino acids. This is because my desktop is killing any processes trying to generate representations for sequences longer than 1000  amino acids. """
          filtering_length_input_file = Path(mmseqs_output_folder).joinpath(f"{ion_name}-clusterRes_rep_seq-without_gaps.fasta")
          filtering_length_output_file = Path(mmseqs_output_folder).joinpath(f"{ion_name}-clusterRes_rep_seq-without_gaps-filtered_lengths.fasta")
          if args.starting_step == "Splitting" or args.starting_step == "Zero" or args.starting_step == "CreatingFastaFile" or args.starting_step == "MMSeqs" or args.starting_step == "removing_gaps":
               filtering_length_in_sequences(filtering_length_input_file,filtering_length_output_file,args.min_seq_length,args.max_seq_length,args.logfile)
#X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-X-

#-------------------------------------------------------------------------
          copying_unique_pdbs_input_file = filtering_length_output_file
          source_folder = downloaded_pdbs_output_folder
          copying_unique_destination=f"../{output_folder_location}/Ion-Unique-PDBs"
          output_folder = Path(copying_unique_destination).joinpath(f"{ion_name}-unique-pdbs")
          if args.starting_step == "Splitting" or args.starting_step == "Zero" or args.starting_step == "CreatingFastaFile" or args.starting_step == "MMSeqs" or args.starting_step == "removing_gaps" or args.starting_step == "Copying_files":
               check_dir(output_folder)
               copy_unique_pdbs_with_resolution_filter(copying_unique_pdbs_input_file,source_folder, output_folder,args.logfile)

if __name__ == "__main__":
    main()
 
