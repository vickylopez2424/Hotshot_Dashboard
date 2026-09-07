# Native (arm64 or amd64) ELMFIRE build for the Hotshot Dashboard.
#
# Why not the upstream image? clauten/elmfire on Docker Hub is amd64-only and
# its Fortran binary cannot open files under the x86 emulation Colima uses on
# Apple Silicon ("Problem opening input file", SIGSEGV under mpirun). The
# upstream Dockerfile also hardcodes a linux-64 micromamba and a full conda
# geospatial env, which is more than the simulator itself needs.
#
# This image: Ubuntu 24.04 + gfortran + OpenMPI + system GDAL 3.8 (the classic
# gdal_translate / gdal_calc.py / gdal_merge.py tools ELMFIRE shells out to),
# then compiles the main `elmfire` executable from a pinned upstream commit.

FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update -y && \
    apt-get install --no-install-recommends -y \
        bc \
        ca-certificates \
        gdal-bin \
        gfortran \
        libopenmpi-dev \
        make \
        openmpi-bin \
        python3-gdal \
        python3-numpy \
        wget && \
    rm -rf /var/lib/apt/lists/*

# Pin the upstream source. Override with --build-arg ELMFIRE_COMMIT=<sha>.
ARG ELMFIRE_COMMIT=945138bea9b22e5651c6f1d7012941afc52e78c4
RUN mkdir -p /elmfire /scratch/elmfire && \
    wget -qO- https://github.com/lautenberger/elmfire/archive/${ELMFIRE_COMMIT}.tar.gz \
        | tar -xz -C /elmfire && \
    mv /elmfire/elmfire-${ELMFIRE_COMMIT} /elmfire/elmfire

# Build only the main executable (skips gprof/perf/debug variants and
# elmfire_post) to keep build time and memory low on a laptop VM.
WORKDIR /elmfire/elmfire/build/linux
RUN ./make_gnu.sh fast && ls -la bin

ENV ELMFIRE_VER=1.1
ENV ELMFIRE_BASE_DIR=/elmfire/elmfire
ENV ELMFIRE_SCRATCH_BASE=/scratch/elmfire
ENV ELMFIRE_INSTALL_DIR=/elmfire/elmfire/build/linux/bin
ENV PATH=$PATH:/elmfire/elmfire/build/linux/bin:/elmfire/elmfire/cloudfire
# OpenMPI refuses to run as root without this; the tutorials call the binary
# directly, but keep mpirun usable too.
ENV OMPI_ALLOW_RUN_AS_ROOT=1
ENV OMPI_ALLOW_RUN_AS_ROOT_CONFIRM=1
ENV USE_SLURM=no

WORKDIR /elmfire/elmfire
CMD ["bash"]
