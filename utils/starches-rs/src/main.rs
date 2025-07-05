use std::io::BufWriter;
use std::io::BufReader;
use std::fs::File;
use std::result::Result;
use flatgeobuf::*;

fn run() -> Result<(), Box<dyn std::error::Error>> {

    let mut fgb = FgbWriter::create_with_options(
        "nihed-assets",
        GeometryType::Point,
        FgbWriterOptions {
            description: Some("NI Historic Environment Division Public Assets (Crown Copyright, see site for license)"),
            write_index: true,
            crs: FgbCrs {
                code: 4326,
                ..Default::default()
            },
            ..Default::default()
        }
    )?;
    let mut fin = BufReader::new(File::open("nihed-assets-wo-index.fgb")?);
    let mut reader = FgbReader::open(&mut fin)?.select_all()?;
    reader.process_features(&mut fgb)?;
    let mut fout = BufWriter::new(File::create("nihed-assets.fgb")?);
    fgb.write(&mut fout)?;
    Ok(())
}

fn main() {
    run().expect("Could not build");
}
